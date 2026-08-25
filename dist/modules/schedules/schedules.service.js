"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSchedule = exports.updateSchedule = exports.getScheduleById = exports.getSchedules = exports.createSchedule = void 0;
const prisma_1 = require("../../shared/database/prisma");
const appError_1 = require("../../shared/errors/appError");
const scheduleSelect = {
    id: true,
    dateTime: true,
    active: true,
    enterpriseUrlId: true,
    enterpriseUrl: {
        select: {
            id: true,
            title: true,
            url: true,
            categoryId: true,
            enterpriseCategory: {
                select: {
                    id: true,
                    name: true,
                }
            }
        }
    }
};
const createSchedule = async (enterpriseId, data) => {
    return await prisma_1.prisma.$transaction(async (tx) => {
        const link = await tx.enterpriseUrl.findFirst({
            where: { id: data.enterpriseUrlId, enterpriseId },
            include: { enterpriseCategory: true }
        });
        if (!link) {
            throw new appError_1.AppError("Link não encontrado ou não pertence a esta empresa", 404);
        }
        const categoryId = link.categoryId;
        // Lock da Categoria para evitar concorrência na mesma categoria
        await tx.$executeRaw `SELECT id FROM "enterprise_category" WHERE "id" = ${categoryId}::uuid FOR UPDATE`;
        // Verifica conflito
        const conflict = await tx.urlSchedule.findFirst({
            where: {
                dateTime: data.dateTime,
                active: true,
                enterpriseUrl: {
                    categoryId: categoryId,
                    enterpriseId: enterpriseId
                }
            }
        });
        if (conflict) {
            throw new appError_1.AppError("Já existe um agendamento ativo para esta data/hora na mesma categoria.", 409);
        }
        return await tx.urlSchedule.create({
            data: {
                enterpriseUrlId: data.enterpriseUrlId,
                dateTime: data.dateTime,
                active: true,
                updateAt: new Date()
            },
            select: scheduleSelect
        });
    });
};
exports.createSchedule = createSchedule;
const getSchedules = async (enterpriseId) => {
    return await prisma_1.prisma.urlSchedule.findMany({
        where: { enterpriseUrl: { enterpriseId } },
        select: scheduleSelect,
        orderBy: { dateTime: 'asc' }
    });
};
exports.getSchedules = getSchedules;
const getScheduleById = async (id, enterpriseId) => {
    const schedule = await prisma_1.prisma.urlSchedule.findFirst({
        where: { id, enterpriseUrl: { enterpriseId } },
        select: scheduleSelect
    });
    if (!schedule)
        throw new appError_1.AppError("Agendamento não encontrado", 404);
    return schedule;
};
exports.getScheduleById = getScheduleById;
const updateSchedule = async (id, enterpriseId, data) => {
    return await prisma_1.prisma.$transaction(async (tx) => {
        // Verifica se o schedule pertence à empresa
        const currentSchedule = await tx.urlSchedule.findFirst({
            where: { id, enterpriseUrl: { enterpriseId } },
            include: { enterpriseUrl: true }
        });
        if (!currentSchedule) {
            throw new appError_1.AppError("Agendamento não encontrado ou acesso negado", 404);
        }
        let newCategoryId = currentSchedule.enterpriseUrl.categoryId;
        if (data.enterpriseUrlId && data.enterpriseUrlId !== currentSchedule.enterpriseUrlId) {
            const newLink = await tx.enterpriseUrl.findFirst({
                where: { id: data.enterpriseUrlId, enterpriseId }
            });
            if (!newLink) {
                throw new appError_1.AppError("Novo link não encontrado ou não pertence a esta empresa", 404);
            }
            newCategoryId = newLink.categoryId;
        }
        // Lock da categoria para evitar corrida no conflito
        await tx.$executeRaw `SELECT id FROM "enterprise_category" WHERE "id" = ${newCategoryId}::uuid FOR UPDATE`;
        const newDateTime = data.dateTime ?? currentSchedule.dateTime;
        const newActive = data.active ?? currentSchedule.active;
        if (newActive) {
            // Se o agendamento vai ficar/continuar ativo, verifica conflito
            const conflict = await tx.urlSchedule.findFirst({
                where: {
                    id: { not: id },
                    dateTime: newDateTime,
                    active: true,
                    enterpriseUrl: {
                        categoryId: newCategoryId,
                        enterpriseId: enterpriseId
                    }
                }
            });
            if (conflict) {
                throw new appError_1.AppError("Já existe um agendamento ativo para esta data/hora na mesma categoria.", 409);
            }
        }
        return await tx.urlSchedule.update({
            where: { id },
            data: {
                enterpriseUrlId: data.enterpriseUrlId,
                dateTime: data.dateTime,
                active: data.active,
                updateAt: new Date()
            },
            select: scheduleSelect
        });
    });
};
exports.updateSchedule = updateSchedule;
const deleteSchedule = async (id, enterpriseId) => {
    const schedule = await prisma_1.prisma.urlSchedule.findFirst({
        where: { id, enterpriseUrl: { enterpriseId } }
    });
    if (!schedule) {
        throw new appError_1.AppError("Agendamento não encontrado ou acesso negado", 404);
    }
    return await prisma_1.prisma.urlSchedule.delete({
        where: { id }
    });
};
exports.deleteSchedule = deleteSchedule;
