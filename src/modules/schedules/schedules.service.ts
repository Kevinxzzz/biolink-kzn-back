import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/appError";
import type { CreateScheduleInput, UpdateScheduleInput } from "../../shared/zod/schedules.zod";

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

export const createSchedule = async (enterpriseId: string, data: CreateScheduleInput) => {
    return await prisma.$transaction(async (tx) => {
        const link = await tx.enterpriseUrl.findFirst({
            where: { id: data.enterpriseUrlId, enterpriseId },
            include: { enterpriseCategory: true }
        });

        if (!link) {
            throw new AppError("Link não encontrado ou não pertence a esta empresa", 404);
        }

        const categoryId = link.categoryId;

        // Lock da Categoria para evitar concorrência na mesma categoria
        await tx.$executeRaw`SELECT id FROM "enterprise_category" WHERE "id" = ${categoryId}::uuid FOR UPDATE`;

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
            throw new AppError("Já existe um agendamento ativo para esta data/hora na mesma categoria.", 409);
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

export const getSchedules = async (enterpriseId: string) => {
    return await prisma.urlSchedule.findMany({
        where: { enterpriseUrl: { enterpriseId } },
        select: scheduleSelect,
        orderBy: { dateTime: 'asc' }
    });
};

export const getScheduleById = async (id: string, enterpriseId: string) => {
    const schedule = await prisma.urlSchedule.findFirst({
        where: { id, enterpriseUrl: { enterpriseId } },
        select: scheduleSelect
    });

    if (!schedule) throw new AppError("Agendamento não encontrado", 404);
    return schedule;
};

export const updateSchedule = async (id: string, enterpriseId: string, data: UpdateScheduleInput) => {
    return await prisma.$transaction(async (tx) => {
        // Verifica se o schedule pertence à empresa
        const currentSchedule = await tx.urlSchedule.findFirst({
            where: { id, enterpriseUrl: { enterpriseId } },
            include: { enterpriseUrl: true }
        });

        if (!currentSchedule) {
            throw new AppError("Agendamento não encontrado ou acesso negado", 404);
        }

        let newCategoryId = currentSchedule.enterpriseUrl.categoryId;

        if (data.enterpriseUrlId && data.enterpriseUrlId !== currentSchedule.enterpriseUrlId) {
            const newLink = await tx.enterpriseUrl.findFirst({
                where: { id: data.enterpriseUrlId, enterpriseId }
            });
            if (!newLink) {
                throw new AppError("Novo link não encontrado ou não pertence a esta empresa", 404);
            }
            newCategoryId = newLink.categoryId;
        }

        // Lock da categoria para evitar corrida no conflito
        await tx.$executeRaw`SELECT id FROM "enterprise_category" WHERE "id" = ${newCategoryId}::uuid FOR UPDATE`;

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
                throw new AppError("Já existe um agendamento ativo para esta data/hora na mesma categoria.", 409);
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

export const deleteSchedule = async (id: string, enterpriseId: string) => {
    const schedule = await prisma.urlSchedule.findFirst({
        where: { id, enterpriseUrl: { enterpriseId } }
    });

    if (!schedule) {
        throw new AppError("Agendamento não encontrado ou acesso negado", 404);
    }

    return await prisma.urlSchedule.delete({
        where: { id }
    });
};
