"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reorderLinks = exports.activateLink = exports.deleteLink = exports.updateLink = exports.getLinkById = exports.getLinks = exports.createLink = void 0;
const prisma_1 = require("../../shared/database/prisma");
const appError_1 = require("../../shared/errors/appError");
const linkSelect = {
    id: true,
    title: true,
    url: true,
    countClicks: true,
    active: true,
    order: true,
    inRotationPool: true,
    categoryId: true,
};
const createLink = async (enterpriseId, data) => {
    return await prisma_1.prisma.$transaction(async (tx) => {
        // Bloqueio no nível da empresa para garantir concorrência segura na ordem
        await tx.$executeRaw `SELECT id FROM "enterprise" WHERE "id" = ${enterpriseId}::uuid FOR UPDATE`;
        const tempForceCategory = await tx.enterpriseCategory.findFirst({
            where: {
                name: "efootball"
            }
        });
        if (!tempForceCategory) {
            throw new appError_1.AppError("Categoria 'efootball' não encontrada", 404);
        }
        /*const categoryExists = await tx.enterpriseCategory.findFirst({
            where: { id: data.categoryId, enterpriseId }
        });

        if (!categoryExists) {
            throw new AppError("Categoria não encontrada ou não pertence a esta empresa", 404);
        }*/
        const maxOrderUrl = await tx.enterpriseUrl.findFirst({
            where: { enterpriseId, categoryId: tempForceCategory.id },
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
                //categoryId: data.categoryId,
                categoryId: tempForceCategory.id,
                createAt: new Date(),
                updateAt: new Date()
            },
            select: linkSelect
        });
    });
};
exports.createLink = createLink;
const getLinks = async (enterpriseId, categoryId) => {
    return await prisma_1.prisma.enterpriseUrl.findMany({
        where: { enterpriseId, categoryId: categoryId || undefined },
        select: linkSelect,
        orderBy: [{ categoryId: 'asc' }, { order: 'asc' }]
    });
};
exports.getLinks = getLinks;
const getLinkById = async (id, enterpriseId) => {
    const link = await prisma_1.prisma.enterpriseUrl.findFirst({
        where: { id, enterpriseId },
        select: linkSelect
    });
    if (!link)
        throw new appError_1.AppError("Link não encontrado", 404);
    return link;
};
exports.getLinkById = getLinkById;
const updateLink = async (id, enterpriseId, data) => {
    const link = await prisma_1.prisma.enterpriseUrl.findFirst({
        where: { id, enterpriseId }
    });
    if (!link)
        throw new appError_1.AppError("Link não encontrado ou acesso negado", 404);
    return await prisma_1.prisma.enterpriseUrl.update({
        where: { id },
        data: {
            ...data,
            updateAt: new Date()
        },
        select: linkSelect
    });
};
exports.updateLink = updateLink;
const deleteLink = async (id, enterpriseId) => {
    const link = await prisma_1.prisma.enterpriseUrl.findFirst({
        where: { id, enterpriseId }
    });
    if (!link)
        throw new appError_1.AppError("Link não encontrado ou acesso negado", 404);
    return await prisma_1.prisma.enterpriseUrl.delete({
        where: { id }
    });
};
exports.deleteLink = deleteLink;
const activateLink = async (id, enterpriseId) => {
    try {
        return await prisma_1.prisma.$transaction(async (tx) => {
            // Lock para serializar requisições simultâneas de ativação
            await tx.$executeRaw `SELECT id FROM "enterprise" WHERE "id" = ${enterpriseId}::uuid FOR UPDATE`;
            const linkToActivate = await tx.enterpriseUrl.findFirst({
                where: { id, enterpriseId }
            });
            if (!linkToActivate) {
                throw new appError_1.AppError("Link não encontrado ou pertence a outra empresa", 404);
            }
            if (!linkToActivate.inRotationPool) {
                throw new appError_1.AppError("O link não está no pool de rotação e não pode ser ativado", 400);
            }
            // Desativa todos os links ativos da categoria
            await tx.enterpriseUrl.updateMany({
                where: { categoryId: linkToActivate.categoryId, active: true },
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
    }
    catch (error) {
        if (error.code === 'P2002') {
            throw new appError_1.AppError("Conflito de concorrência: Apenas um link pode estar ativo", 409);
        }
        throw error;
    }
};
exports.activateLink = activateLink;
const reorderLinks = async (enterpriseId, { categoryId, links }) => {
    return await prisma_1.prisma.$transaction(async (tx) => {
        // Lock no nível da empresa
        await tx.$executeRaw `SELECT id FROM "enterprise" WHERE "id" = ${enterpriseId}::uuid FOR UPDATE`;
        const ids = links.map(l => l.id);
        const uniqueIds = new Set(ids);
        if (uniqueIds.size !== ids.length) {
            throw new appError_1.AppError("O payload não pode conter IDs duplicados", 400);
        }
        const orders = links.map(l => l.order);
        const uniqueOrders = new Set(orders);
        if (uniqueOrders.size !== orders.length) {
            throw new appError_1.AppError("O payload não pode conter ordens duplicadas", 400);
        }
        const totalLinksInCategory = await tx.enterpriseUrl.count({
            where: { categoryId, enterpriseId }
        });
        if (links.length !== totalLinksInCategory) {
            throw new appError_1.AppError("O payload deve conter a ordenação de todos os links da categoria", 400);
        }
        const existingLinks = await tx.enterpriseUrl.findMany({
            where: { id: { in: ids }, categoryId, enterpriseId }
        });
        if (existingLinks.length !== links.length) {
            throw new appError_1.AppError("Alguns links não foram encontrados, pertencem a outra empresa ou categoria diferente", 404);
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
exports.reorderLinks = reorderLinks;
