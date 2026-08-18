import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/appError";
import type { CreateLinkInput, UpdateLinkInput, ReorderLinksInput } from "../../shared/zod/links.zod";

const linkSelect = {
    id: true,
    title: true,
    url: true,
    countClicks: true,
    active: true,
    order: true,
    inRotationPool: true,
};

export const createLink = async (enterpriseId: string, data: CreateLinkInput) => {
    return await prisma.$transaction(async (tx) => {
        // Bloqueio no nível da empresa para garantir concorrência segura na ordem
        await tx.$executeRaw`SELECT id FROM "enterprise" WHERE "id" = ${enterpriseId}::uuid FOR UPDATE`;

        const maxOrderUrl = await tx.enterpriseUrl.findFirst({
            where: { enterpriseId },
            orderBy: { order: 'desc' }
        });

        const newOrder = maxOrderUrl ? maxOrderUrl.order + 1 : 1;

        return await tx.enterpriseUrl.create({
            data: {
                title: data.title,
                url: data.url,
                order: newOrder,
                active: false,
                countClicks: 0,
                inRotationPool: true,
                enterpriseId,
                createAt: new Date(),
                updateAt: new Date()
            },
            select: linkSelect
        });
    });
};

export const getLinks = async (enterpriseId: string) => {
    return await prisma.enterpriseUrl.findMany({
        where: { enterpriseId },
        select: linkSelect,
        orderBy: { order: 'asc' }
    });
};

export const getLinkById = async (id: string, enterpriseId: string) => {
    const link = await prisma.enterpriseUrl.findFirst({
        where: { id, enterpriseId },
        select: linkSelect
    });
    if (!link) throw new AppError("Link não encontrado", 404);
    return link;
};

export const updateLink = async (id: string, enterpriseId: string, data: UpdateLinkInput) => {
    const link = await prisma.enterpriseUrl.findFirst({
        where: { id, enterpriseId }
    });
    if (!link) throw new AppError("Link não encontrado ou acesso negado", 404);

    return await prisma.enterpriseUrl.update({
        where: { id },
        data: {
            ...data,
            updateAt: new Date()
        },
        select: linkSelect
    });
};

export const deleteLink = async (id: string, enterpriseId: string) => {
    const link = await prisma.enterpriseUrl.findFirst({
        where: { id, enterpriseId }
    });
    if (!link) throw new AppError("Link não encontrado ou acesso negado", 404);

    return await prisma.enterpriseUrl.delete({
        where: { id }
    });
};

export const activateLink = async (id: string, enterpriseId: string) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // Lock para serializar requisições simultâneas de ativação
            await tx.$executeRaw`SELECT id FROM "enterprise" WHERE "id" = ${enterpriseId}::uuid FOR UPDATE`;

            const linkToActivate = await tx.enterpriseUrl.findFirst({
                where: { id, enterpriseId }
            });

            if (!linkToActivate) {
                throw new AppError("Link não encontrado ou pertence a outra empresa", 404);
            }

            if (!linkToActivate.inRotationPool) {
                throw new AppError("O link não está no pool de rotação e não pode ser ativado", 400);
            }

            // Desativa todos os links ativos da empresa
            await tx.enterpriseUrl.updateMany({
                where: { enterpriseId, active: true },
                data: { active: false, updateAt: new Date() }
            });

            // Ativa o link e reseta os cliques
            return await tx.enterpriseUrl.update({
                where: { id },
                data: {
                    active: true,
                    countClicks: 0,
                    updateAt: new Date()
                },
                select: linkSelect
            });
        });
    } catch (error: any) {
        if (error.code === 'P2002') {
            throw new AppError("Conflito de concorrência: Apenas um link pode estar ativo", 409);
        }
        throw error;
    }
};

export const reorderLinks = async (enterpriseId: string, { links }: ReorderLinksInput) => {
    return await prisma.$transaction(async (tx) => {
        // Lock no nível da empresa
        await tx.$executeRaw`SELECT id FROM "enterprise" WHERE "id" = ${enterpriseId}::uuid FOR UPDATE`;

        const ids = links.map(l => l.id);
        const uniqueIds = new Set(ids);
        if (uniqueIds.size !== ids.length) {
            throw new AppError("O payload não pode conter IDs duplicados", 400);
        }

        const orders = links.map(l => l.order);
        const uniqueOrders = new Set(orders);
        if (uniqueOrders.size !== orders.length) {
            throw new AppError("O payload não pode conter ordens duplicadas", 400);
        }

        const existingLinks = await tx.enterpriseUrl.findMany({
            where: { id: { in: ids }, enterpriseId }
        });

        if (existingLinks.length !== links.length) {
            throw new AppError("Alguns links não foram encontrados ou pertencem a outra empresa", 404);
        }

        // Fazer os updates
        // Uma forma segura para evitar unique constraint em caso futuro seria usar um UPDATE no lugar de iteração ou algo que diferencie, mas iteração serve bem por agora sem constraint explícita em order.
        const updatedLinks = [];
        for (const link of links) {
            const updated = await tx.enterpriseUrl.update({
                where: { id: link.id },
                data: { order: link.order, updateAt: new Date() },
                select: linkSelect
            });
            updatedLinks.push(updated);
        }

        return updatedLinks;
    });
};
