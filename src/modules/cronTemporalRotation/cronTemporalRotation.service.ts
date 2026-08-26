import { prisma } from "../../shared/database/prisma";
import { redis } from "../../shared/database/redis";
import { getNextEligibleLink } from "../../shared/utils/linkUtils";
import { getTodayBRTReferenceDate } from "../../shared/utils/dateUtils";

const DECR_LUA_SCRIPT = `
    local current = tonumber(redis.call('GET', KEYS[1]) or '0')
    local sub = tonumber(ARGV[1])
    if current >= sub then
        redis.call('DECRBY', KEYS[1], sub)
        return 1
    end
    return 0
`;
export const processTemporalRotations = async () => {
    try {
        await processTimerRotations();
        await processScheduleRotations();
    } catch (error) {
        console.error("Erro no processTemporalRotations:", error);
    }
};

const processTimerRotations = async () => {
    const categoriesTimer = await prisma.categoryRotation.findMany({
        where: { toggleType: "TIMER" }
    });

    for (const config of categoriesTimer) {
        if (!config.timerInMinutes || !config.timerStartedAt) continue;

        const now = new Date();
        const expirationTime = new Date(config.timerStartedAt.getTime() + config.timerInMinutes * 60000);

        if (expirationTime <= now) {
            let compensatedAmount = 0;
            let currentEntId = "";
            try {
                await prisma.$transaction(async (tx) => {
                    // Lock da Categoria
                    await tx.$executeRaw`SELECT id FROM "enterprise_category" WHERE "id" = ${config.categoryId}::uuid FOR UPDATE`;

                    // Double-check para concorrência
                    const currentConfig = await tx.categoryRotation.findUnique({
                        where: { categoryId: config.categoryId }
                    });

                    if (!currentConfig || currentConfig.toggleType !== "TIMER" || !currentConfig.timerStartedAt) return;

                    const currentExp = new Date(currentConfig.timerStartedAt.getTime() + (currentConfig.timerInMinutes || 0) * 60000);
                    if (currentExp > new Date()) return; // Já foi rotacionado por outra thread/worker

                    const currentActive = await tx.enterpriseUrl.findFirst({
                        where: { categoryId: config.categoryId, active: true }
                    });

                    if (!currentActive) return;

                    currentEntId = currentActive.enterpriseId;
                    const nextLink = await getNextEligibleLink(tx, currentActive.enterpriseId, config.categoryId, currentActive);

                    // Só realiza a rotação e reinicia o timer se houver um link diferente elegível
                    if (nextLink && nextLink.id !== currentActive.id) {
                        const redisKey = `clicks:${currentActive.enterpriseId}:${config.categoryId}`;
                        const redisCountStr = await redis.get(redisKey);
                        const pending = redisCountStr ? parseInt(redisCountStr, 10) : 0;

                        if (pending > 0) {
                            await tx.enterpriseUrl.update({
                                where: { id: currentActive.id },
                                data: { countClicks: { increment: pending }, active: false, updateAt: new Date() }
                            });

                            const referenceDate = getTodayBRTReferenceDate();
                            await tx.enterpriseCountDailyClicks.upsert({
                                where: { enterpriseId_referenceDate: { enterpriseId: currentActive.enterpriseId, referenceDate } },
                                create: { enterpriseId: currentActive.enterpriseId, referenceDate, dailyClicks: pending, createAt: new Date(), updateAt: new Date() },
                                update: { dailyClicks: { increment: pending }, updateAt: new Date() }
                            });
                            
                            compensatedAmount = pending;
                            const evalResult = await redis.eval(DECR_LUA_SCRIPT, 1, redisKey, pending);
                            if (evalResult === 0) compensatedAmount = 0;
                        } else {
                            await tx.enterpriseUrl.update({
                                where: { id: currentActive.id },
                                data: { active: false, updateAt: new Date() }
                            });
                        }

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
            } catch (err) {
                console.error(`Erro ao processar TIMER da categoria ${config.categoryId}:`, err);
                if (compensatedAmount > 0 && currentEntId) {
                    await redis.incrby(`clicks:${currentEntId}:${config.categoryId}`, compensatedAmount);
                }
            }
        }
    }
};

const processScheduleRotations = async () => {
    const schedules = await prisma.urlSchedule.findMany({
        where: { active: true, dateTime: { lte: new Date() } },
        include: { enterpriseUrl: true },
        orderBy: { dateTime: 'asc' }
    });

    if (schedules.length === 0) return;

    // Agrupa por categoria para garantir sequência e evitar deadlocks
    const schedulesByCategory = schedules.reduce((acc, sch) => {
        const catId = sch.enterpriseUrl.categoryId;
        if (!acc[catId]) acc[catId] = [];
        acc[catId].push(sch);
        return acc;
    }, {} as Record<string, typeof schedules>);

    for (const categoryId of Object.keys(schedulesByCategory)) {
        const categorySchedules = schedulesByCategory[categoryId];
        let compensatedAmount = 0;

        try {
            await prisma.$transaction(async (tx) => {
                // Lock da Categoria
                await tx.$executeRaw`SELECT id FROM "enterprise_category" WHERE "id" = ${categoryId}::uuid FOR UPDATE`;

                for (const schedule of categorySchedules) {
                    // Double-check do schedule atual
                    const currentSchedule = await tx.urlSchedule.findUnique({
                        where: { id: schedule.id }
                    });

                    if (!currentSchedule || !currentSchedule.active || currentSchedule.dateTime > new Date()) continue;

                    const currentActive = await tx.enterpriseUrl.findFirst({
                        where: { categoryId, active: true }
                    });

                    // Se houver um link ativo e ele for DIFERENTE do agendado, desativa o atual e ativa o agendado.
                    // O agendamento ignora inRotationPool (conforme regra de negócio).
                        if (currentActive && currentActive.id !== schedule.enterpriseUrlId) {
                            // Consolidar cliques do link antigo antes de trocar
                            const redisKey = `clicks:${currentActive.enterpriseId}:${categoryId}`;
                            const redisCountStr = await redis.get(redisKey);
                            const pending = redisCountStr ? parseInt(redisCountStr, 10) : 0;
                            
                            if (pending > 0) {
                                await tx.enterpriseUrl.update({
                                    where: { id: currentActive.id },
                                    data: { countClicks: { increment: pending }, active: false, updateAt: new Date() }
                                });

                                const referenceDate = getTodayBRTReferenceDate();
                                await tx.enterpriseCountDailyClicks.upsert({
                                    where: { enterpriseId_referenceDate: { enterpriseId: currentActive.enterpriseId, referenceDate } },
                                    create: { enterpriseId: currentActive.enterpriseId, referenceDate, dailyClicks: pending, createAt: new Date(), updateAt: new Date() },
                                    update: { dailyClicks: { increment: pending }, updateAt: new Date() }
                                });
                                
                                compensatedAmount = pending;
                                const evalResult = await redis.eval(DECR_LUA_SCRIPT, 1, redisKey, pending);
                                if (evalResult === 0) compensatedAmount = 0;
                            } else {
                                await tx.enterpriseUrl.update({
                                    where: { id: currentActive.id },
                                    data: { active: false, updateAt: new Date() }
                                });
                            }

                            await tx.enterpriseUrl.update({
                                where: { id: schedule.enterpriseUrlId },
                                data: { active: true, updateAt: new Date() }
                            });
                        } else if (!currentActive) {
                            // Edge case: nenhum link estava ativo, simplesmente ativamos o alvo
                            await tx.enterpriseUrl.update({
                                where: { id: schedule.enterpriseUrlId },
                                data: { active: true, updateAt: new Date() }
                            });
                        }

                        // Marca o schedule como inativo (concluído)
                        await tx.urlSchedule.update({
                            where: { id: schedule.id },
                            data: { active: false, updateAt: new Date() }
                        });
                    }
                });
            } catch (err) {
                console.error(`Erro ao processar SCHEDULES da categoria ${categoryId}:`, err);
                if (compensatedAmount > 0) {
                    await redis.incrby(`clicks:${categorySchedules[0]?.enterpriseUrl?.enterpriseId}:${categoryId}`, compensatedAmount);
                }
            }
    }
};
