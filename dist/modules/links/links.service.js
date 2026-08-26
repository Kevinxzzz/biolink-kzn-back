"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processClickAndRedirectOnlyEfootball = exports.processClickAndRedirect = exports.reorderLinks = exports.activateLink = exports.deleteLink = exports.updateLink = exports.getLinkById = exports.getLinks = exports.createLink = void 0;
const prisma_1 = require("../../shared/database/prisma");
const appError_1 = require("../../shared/errors/appError");
const redis_1 = require("../../shared/database/redis");
const linkUtils_1 = require("../../shared/utils/linkUtils");
const env_1 = require("../../shared/config/env");
const dateUtils_1 = require("../../shared/utils/dateUtils");
const DECR_LUA_SCRIPT = `
local key = KEYS[1]
local amount = tonumber(ARGV[1])
local current = tonumber(redis.call('GET', key) or '0')

if current >= amount then
    redis.call('DECRBY', key, amount)
    return 1
else
    return 0
end
`;
const CHECK_LIMIT_LUA_SCRIPT = `
local key = KEYS[1]
local dbCount = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local pending = tonumber(redis.call('GET', key) or '0')

if (dbCount + pending) >= limit then
    return -1
else
    return redis.call('INCR', key)
end
`;
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
    const links = await prisma_1.prisma.enterpriseUrl.findMany({
        where: { enterpriseId, categoryId: categoryId || undefined },
        select: linkSelect,
        orderBy: [{ categoryId: 'asc' }, { order: 'asc' }]
    });
    return await Promise.all(links.map(async (link) => {
        if (!link.active) {
            return link;
        }
        const key = `clicks:${enterpriseId}:${link.categoryId}`;
        const redisCountStr = await redis_1.redis.get(key);
        const redisCount = redisCountStr ? parseInt(redisCountStr, 10) : 0;
        return {
            ...link,
            countClicks: link.countClicks + (isNaN(redisCount) ? 0 : redisCount)
        };
    }));
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
        const linkToActivate = await prisma_1.prisma.enterpriseUrl.findFirst({ where: { id } });
        if (!linkToActivate || linkToActivate.enterpriseId !== enterpriseId) {
            throw new appError_1.AppError("Link não encontrado ou não pertence a esta empresa", 404);
        }
        if (!linkToActivate.inRotationPool) {
            throw new appError_1.AppError("Este link não faz parte do pool de rotação e não pode ser ativado manualmente.", 400);
        }
        const categoryKey = `clicks:${enterpriseId}:${linkToActivate.categoryId}`;
        let compensatedAmount = 0;
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT id FROM "enterprise_category" WHERE "id" = ${linkToActivate.categoryId}::uuid FOR UPDATE`;
            const currentActive = await tx.enterpriseUrl.findFirst({
                where: { enterpriseId, categoryId: linkToActivate.categoryId, active: true },
            });
            if (currentActive && currentActive.id !== linkToActivate.id) {
                const redisCountStrTx = await redis_1.redis.get(categoryKey);
                const pending = redisCountStrTx ? parseInt(redisCountStrTx, 10) : 0;
                if (pending > 0) {
                    await tx.enterpriseUrl.update({
                        where: { id: currentActive.id },
                        data: { countClicks: { increment: pending }, active: false, updateAt: new Date() }
                    });
                    const referenceDate = (0, dateUtils_1.getTodayBRTReferenceDate)();
                    await tx.enterpriseCountDailyClicks.upsert({
                        where: { enterpriseId_referenceDate: { enterpriseId, referenceDate } },
                        create: { enterpriseId, referenceDate, dailyClicks: pending, createAt: new Date(), updateAt: new Date() },
                        update: { dailyClicks: { increment: pending }, updateAt: new Date() }
                    });
                    compensatedAmount = pending;
                    const evalResult = await redis_1.redis.eval(DECR_LUA_SCRIPT, 1, categoryKey, pending);
                    if (evalResult === 0)
                        compensatedAmount = 0;
                }
                else {
                    await tx.enterpriseUrl.update({
                        where: { id: currentActive.id },
                        data: { active: false, updateAt: new Date() }
                    });
                }
            }
            else if (currentActive && currentActive.id === linkToActivate.id) {
                return currentActive;
            }
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
        return result;
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
        let targetCategoryId = categoryId;
        if (!targetCategoryId) {
            const firstLink = await tx.enterpriseUrl.findFirst({
                where: { id: links[0].id, enterpriseId },
                select: { categoryId: true }
            });
            if (!firstLink) {
                throw new appError_1.AppError("Link não encontrado ou pertence a outra empresa", 404);
            }
            targetCategoryId = firstLink.categoryId;
        }
        const totalLinksInCategory = await tx.enterpriseUrl.count({
            where: { categoryId: targetCategoryId, enterpriseId }
        });
        if (links.length !== totalLinksInCategory) {
            throw new appError_1.AppError("O payload deve conter a ordenação de todos os links da categoria", 400);
        }
        const existingLinks = await tx.enterpriseUrl.findMany({
            where: { id: { in: ids }, categoryId: targetCategoryId, enterpriseId }
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
const processClickAndRedirect = async (enterpriseId, categoryId) => {
    const key = `clicks:${enterpriseId}:${categoryId}`;
    let compensatedAmount = 0;
    const link = await prisma_1.prisma.enterpriseUrl.findFirst({
        where: { enterpriseId, categoryId, active: true },
    });
    if (!link) {
        throw new appError_1.AppError("Nenhum link ativo encontrado para esta categoria.", 404);
    }
    const config = await prisma_1.prisma.categoryRotation.findFirst({
        where: { categoryId }
    });
    if (!config) {
        await redis_1.redis.incr(key);
        return link.url;
    }
    let shouldRotate = false;
    if (config.toggleType === "LIMITCLICKS" && config.limitClicks) {
        const luaResult = await redis_1.redis.eval(CHECK_LIMIT_LUA_SCRIPT, 1, key, link.countClicks, config.limitClicks);
        if (luaResult === -1) {
            shouldRotate = true;
        }
        else {
            return link.url;
        }
    }
    if (shouldRotate) {
        try {
            const result = await prisma_1.prisma.$transaction(async (tx) => {
                await tx.$executeRaw `SELECT id FROM "enterprise_category" WHERE "id" = ${categoryId}::uuid FOR UPDATE`;
                const currentActive = await tx.enterpriseUrl.findFirst({
                    where: { enterpriseId, categoryId, active: true }
                });
                if (currentActive?.id !== link.id) {
                    return { rotatedByUs: false, consolidatedByUs: false, link: currentActive || link };
                }
                const nextLink = await (0, linkUtils_1.getNextEligibleLink)(tx, enterpriseId, categoryId, link);
                const redisCountStrTx = await redis_1.redis.get(key);
                const pending = redisCountStrTx ? parseInt(redisCountStrTx, 10) : 0;
                if (!nextLink) {
                    if (pending > 0) {
                        await tx.enterpriseUrl.update({
                            where: { id: link.id },
                            data: { countClicks: { increment: pending }, updateAt: new Date() }
                        });
                        const referenceDate = (0, dateUtils_1.getTodayBRTReferenceDate)();
                        await tx.enterpriseCountDailyClicks.upsert({
                            where: { enterpriseId_referenceDate: { enterpriseId, referenceDate } },
                            create: { enterpriseId, referenceDate, dailyClicks: pending, createAt: new Date(), updateAt: new Date() },
                            update: { dailyClicks: { increment: pending }, updateAt: new Date() }
                        });
                        compensatedAmount = pending;
                        const evalResult = await redis_1.redis.eval(DECR_LUA_SCRIPT, 1, key, pending);
                        if (evalResult === 0)
                            compensatedAmount = 0;
                    }
                    return { rotatedByUs: false, consolidatedByUs: true, link };
                }
                const actualClicksRegistered = link.countClicks + pending;
                await tx.enterpriseUrl.update({
                    where: { id: link.id },
                    data: { active: false, countClicks: actualClicksRegistered, updateAt: new Date() }
                });
                if (pending > 0) {
                    const referenceDate = (0, dateUtils_1.getTodayBRTReferenceDate)();
                    await tx.enterpriseCountDailyClicks.upsert({
                        where: { enterpriseId_referenceDate: { enterpriseId, referenceDate } },
                        create: { enterpriseId, referenceDate, dailyClicks: pending, createAt: new Date(), updateAt: new Date() },
                        update: { dailyClicks: { increment: pending }, updateAt: new Date() }
                    });
                    compensatedAmount = pending;
                    const evalResult = await redis_1.redis.eval(DECR_LUA_SCRIPT, 1, key, pending);
                    if (evalResult === 0)
                        compensatedAmount = 0;
                }
                const activatedLink = await tx.enterpriseUrl.update({
                    where: { id: nextLink.id },
                    data: { active: true, countClicks: 0, updateAt: new Date() }
                });
                return { rotatedByUs: true, consolidatedByUs: false, link: activatedLink };
            });
            if (result.rotatedByUs || result.consolidatedByUs || (!result.rotatedByUs && !result.consolidatedByUs)) {
                await redis_1.redis.incr(key);
            }
            return result.link.url;
        }
        catch (err) {
            if (compensatedAmount > 0) {
                await redis_1.redis.incrby(key, compensatedAmount);
            }
            throw err;
        }
    }
    // Fluxo Normal (MANUAL, TIMER, SCHEDULE)
    await redis_1.redis.incr(key);
    return link.url;
};
exports.processClickAndRedirect = processClickAndRedirect;
const processClickAndRedirectOnlyEfootball = async () => {
    const categoryEfootball = await prisma_1.prisma.enterpriseCategory.findFirst({
        where: { name: "efootball" }
    });
    if (!categoryEfootball) {
        throw new appError_1.AppError("Categoria efootball não cadastrada.", 404);
    }
    const enterpriseId = env_1.env.ENTERPRISE_ID_KZN;
    if (!enterpriseId) {
        throw new appError_1.AppError("EnterpriseId indefinido.", 404);
    }
    return await (0, exports.processClickAndRedirect)(enterpriseId, categoryEfootball.id);
};
exports.processClickAndRedirectOnlyEfootball = processClickAndRedirectOnlyEfootball;
