"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processTemporalRotations = void 0;
const prisma_1 = require("../../shared/database/prisma");
const linkUtils_1 = require("../../shared/utils/linkUtils");
const processTemporalRotations = async () => {
    try {
        await processTimerRotations();
        await processScheduleRotations();
    }
    catch (error) {
        console.error("Erro no processTemporalRotations:", error);
    }
};
exports.processTemporalRotations = processTemporalRotations;
const processTimerRotations = async () => {
    const categoriesTimer = await prisma_1.prisma.categoryRotation.findMany({
        where: { toggleType: "TIMER" }
    });
    for (const config of categoriesTimer) {
        if (!config.timerInMinutes || !config.timerStartedAt)
            continue;
        const now = new Date();
        const expirationTime = new Date(config.timerStartedAt.getTime() + config.timerInMinutes * 60000);
        if (expirationTime <= now) {
            try {
                await prisma_1.prisma.$transaction(async (tx) => {
                    // Lock da Categoria
                    await tx.$executeRaw `SELECT id FROM "enterprise_category" WHERE "id" = ${config.categoryId}::uuid FOR UPDATE`;
                    // Double-check para concorrência
                    const currentConfig = await tx.categoryRotation.findUnique({
                        where: { categoryId: config.categoryId }
                    });
                    if (!currentConfig || currentConfig.toggleType !== "TIMER" || !currentConfig.timerStartedAt)
                        return;
                    const currentExp = new Date(currentConfig.timerStartedAt.getTime() + (currentConfig.timerInMinutes || 0) * 60000);
                    if (currentExp > new Date())
                        return; // Já foi rotacionado por outra thread/worker
                    const currentActive = await tx.enterpriseUrl.findFirst({
                        where: { categoryId: config.categoryId, active: true }
                    });
                    if (!currentActive)
                        return;
                    const nextLink = await (0, linkUtils_1.getNextEligibleLink)(tx, currentActive.enterpriseId, config.categoryId, currentActive);
                    // Só realiza a rotação e reinicia o timer se houver um link diferente elegível
                    if (nextLink && nextLink.id !== currentActive.id) {
                        await tx.enterpriseUrl.update({
                            where: { id: currentActive.id },
                            data: { active: false, updateAt: new Date() }
                        });
                        await tx.enterpriseUrl.update({
                            where: { id: nextLink.id },
                            data: { active: true, updateAt: new Date() }
                        });
                        await tx.categoryRotation.update({
                            where: { categoryId: config.categoryId },
                            data: { timerStartedAt: new Date(), updateAt: new Date() }
                        });
                    }
                });
            }
            catch (err) {
                console.error(`Erro ao processar TIMER da categoria ${config.categoryId}:`, err);
            }
        }
    }
};
const processScheduleRotations = async () => {
    const schedules = await prisma_1.prisma.urlSchedule.findMany({
        where: { active: true, dateTime: { lte: new Date() } },
        include: { enterpriseUrl: true },
        orderBy: { dateTime: 'asc' }
    });
    if (schedules.length === 0)
        return;
    // Agrupa por categoria para garantir sequência e evitar deadlocks
    const schedulesByCategory = schedules.reduce((acc, sch) => {
        const catId = sch.enterpriseUrl.categoryId;
        if (!acc[catId])
            acc[catId] = [];
        acc[catId].push(sch);
        return acc;
    }, {});
    for (const categoryId of Object.keys(schedulesByCategory)) {
        const categorySchedules = schedulesByCategory[categoryId];
        try {
            await prisma_1.prisma.$transaction(async (tx) => {
                // Lock da Categoria
                await tx.$executeRaw `SELECT id FROM "enterprise_category" WHERE "id" = ${categoryId}::uuid FOR UPDATE`;
                for (const schedule of categorySchedules) {
                    // Double-check do schedule atual
                    const currentSchedule = await tx.urlSchedule.findUnique({
                        where: { id: schedule.id }
                    });
                    if (!currentSchedule || !currentSchedule.active || currentSchedule.dateTime > new Date())
                        continue;
                    const currentActive = await tx.enterpriseUrl.findFirst({
                        where: { categoryId, active: true }
                    });
                    // Se houver um link ativo e ele for DIFERENTE do agendado, desativa o atual e ativa o agendado.
                    // O agendamento ignora inRotationPool (conforme regra de negócio).
                    if (currentActive && currentActive.id !== schedule.enterpriseUrlId) {
                        await tx.enterpriseUrl.update({
                            where: { id: currentActive.id },
                            data: { active: false, updateAt: new Date() }
                        });
                        await tx.enterpriseUrl.update({
                            where: { id: schedule.enterpriseUrlId },
                            data: { active: true, updateAt: new Date() }
                        });
                    }
                    else if (!currentActive) {
                        // Edge case: nenhum link estava ativo, simplesmente ativamos o alvo
                        await tx.enterpriseUrl.update({
                            where: { id: schedule.enterpriseUrlId },
                            data: { active: true, updateAt: new Date() }
                        });
                    }
                    // Marca o schedule como inativo (concluído) indepedente se precisou trocar o link ou se ele já era o ativo
                    await tx.urlSchedule.update({
                        where: { id: schedule.id },
                        data: { active: false, updateAt: new Date() }
                    });
                }
            });
        }
        catch (err) {
            console.error(`Erro ao processar SCHEDULES da categoria ${categoryId}:`, err);
        }
    }
};
