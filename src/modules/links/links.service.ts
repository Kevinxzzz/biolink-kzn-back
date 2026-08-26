import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/appError";
import type { CreateLinkInput, UpdateLinkInput, ReorderLinksInput } from "../../shared/zod/links.zod";
import { redis } from "../../shared/database/redis";
import { getNextEligibleLink } from "../../shared/utils/linkUtils";
import { env } from "../../shared/config/env";
import { getTodayBRTReferenceDate } from "../../shared/utils/dateUtils";


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

export const createLink = async (enterpriseId: string, data: CreateLinkInput) => {
    return await prisma.$transaction(async (tx) => {
        // Bloqueio no nível da empresa para garantir concorrência segura na ordem
        await tx.$executeRaw`SELECT id FROM "enterprise" WHERE "id" = ${enterpriseId}::uuid FOR UPDATE`;
        const tempForceCategory = await tx.enterpriseCategory.findFirst({
            where: {
                name: "efootball"
            }
        });

        if (!tempForceCategory) {
            throw new AppError("Categoria 'efootball' não encontrada", 404);
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

export const getLinks = async (enterpriseId: string, categoryId?: string) => {
    const links = await prisma.enterpriseUrl.findMany({
        where: { enterpriseId, categoryId: categoryId || undefined },
        select: linkSelect,
        orderBy: [{ categoryId: 'asc' }, { order: 'asc' }]
    });

    return await Promise.all(
        links.map(async (link) => {
            if (!link.active) {
                return link;
            }

            const key = `clicks:${enterpriseId}:${link.categoryId}`;
            const redisCountStr = await redis.get(key);
            const redisCount = redisCountStr ? parseInt(redisCountStr, 10) : 0;

            return {
                ...link,
                countClicks: link.countClicks + (isNaN(redisCount) ? 0 : redisCount)
            };
        })
    );
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
        const linkToActivate = await prisma.enterpriseUrl.findFirst({ where: { id } });
        if (!linkToActivate || linkToActivate.enterpriseId !== enterpriseId) {
            throw new AppError("Link não encontrado ou não pertence a esta empresa", 404);
        }
        if (!linkToActivate.inRotationPool) {
            throw new AppError("Este link não faz parte do pool de rotação e não pode ser ativado manualmente.", 400);
        }

        const categoryKey = `clicks:${enterpriseId}:${linkToActivate.categoryId}`;
        let compensatedAmount = 0;

        const result = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT id FROM "enterprise_category" WHERE "id" = ${linkToActivate.categoryId}::uuid FOR UPDATE`;

            const currentActive = await tx.enterpriseUrl.findFirst({
                where: { enterpriseId, categoryId: linkToActivate.categoryId, active: true },
            });

            if (currentActive && currentActive.id !== linkToActivate.id) {
                const redisCountStrTx = await redis.get(categoryKey);
                const pending = redisCountStrTx ? parseInt(redisCountStrTx, 10) : 0;

                if (pending > 0) {
                    await tx.enterpriseUrl.update({
                        where: { id: currentActive.id },
                        data: { countClicks: { increment: pending }, active: false, updateAt: new Date() }
                    });

                    const referenceDate = getTodayBRTReferenceDate();
                    await tx.enterpriseCountDailyClicks.upsert({
                        where: { enterpriseId_referenceDate: { enterpriseId, referenceDate } },
                        create: { enterpriseId, referenceDate, dailyClicks: pending, createAt: new Date(), updateAt: new Date() },
                        update: { dailyClicks: { increment: pending }, updateAt: new Date() }
                    });

                    compensatedAmount = pending;
                    const evalResult = await redis.eval(DECR_LUA_SCRIPT, 1, categoryKey, pending);
                    if (evalResult === 0) compensatedAmount = 0;
                } else {
                    await tx.enterpriseUrl.update({
                        where: { id: currentActive.id },
                        data: { active: false, updateAt: new Date() }
                    });
                }
            } else if (currentActive && currentActive.id === linkToActivate.id) {
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
    } catch (error: any) {
        if (error.code === 'P2002') {
            throw new AppError("Conflito de concorrência: Apenas um link pode estar ativo", 409);
        }
        throw error;
    }
};

export const reorderLinks = async (enterpriseId: string, { categoryId, links }: ReorderLinksInput) => {
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

        let targetCategoryId = categoryId;
        if (!targetCategoryId) {
            const firstLink = await tx.enterpriseUrl.findFirst({
                where: { id: links[0].id, enterpriseId },
                select: { categoryId: true }
            });
            if (!firstLink) {
                throw new AppError("Link não encontrado ou pertence a outra empresa", 404);
            }
            targetCategoryId = firstLink.categoryId;
        }

        const totalLinksInCategory = await tx.enterpriseUrl.count({
            where: { categoryId: targetCategoryId, enterpriseId }
        });

        if (links.length !== totalLinksInCategory) {
            throw new AppError("O payload deve conter a ordenação de todos os links da categoria", 400);
        }

        const existingLinks = await tx.enterpriseUrl.findMany({
            where: { id: { in: ids }, categoryId: targetCategoryId, enterpriseId }
        });

        if (existingLinks.length !== links.length) {
            throw new AppError("Alguns links não foram encontrados, pertencem a outra empresa ou categoria diferente", 404);
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

export const processClickAndRedirect = async (enterpriseId: string, categoryId: string): Promise<string> => {
    const key = `clicks:${enterpriseId}:${categoryId}`;
    let compensatedAmount = 0;

    const link = await prisma.enterpriseUrl.findFirst({
        where: { enterpriseId, categoryId, active: true },
    });

    if (!link) {
        throw new AppError("Nenhum link ativo encontrado para esta categoria.", 404);
    }

    const config = await prisma.categoryRotation.findFirst({
        where: { categoryId }
    });

    if (!config) {
        await redis.incr(key);
        return link.url;
    }

    let shouldRotate = false;

    if (config.toggleType === "LIMITCLICKS" && config.limitClicks) {
        const luaResult = await redis.eval(CHECK_LIMIT_LUA_SCRIPT, 1, key, link.countClicks, config.limitClicks);
        if (luaResult === -1) {
            shouldRotate = true;
        } else {
            return link.url;
        }
    }

    if (shouldRotate) {
        try {
            const result = await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT id FROM "enterprise_category" WHERE "id" = ${categoryId}::uuid FOR UPDATE`;
                
                const currentActive = await tx.enterpriseUrl.findFirst({
                    where: { enterpriseId, categoryId, active: true }
                });

                if (currentActive?.id !== link.id) {
                    return { rotatedByUs: false, consolidatedByUs: false, link: currentActive || link };
                }

                const nextLink = await getNextEligibleLink(tx, enterpriseId, categoryId, link);

                const redisCountStrTx = await redis.get(key);
                const pending = redisCountStrTx ? parseInt(redisCountStrTx, 10) : 0;

                if (!nextLink) {
                    if (pending > 0) {
                        await tx.enterpriseUrl.update({
                            where: { id: link.id },
                            data: { countClicks: { increment: pending }, updateAt: new Date() }
                        });
                        
                        const referenceDate = getTodayBRTReferenceDate();
                        await tx.enterpriseCountDailyClicks.upsert({
                            where: { enterpriseId_referenceDate: { enterpriseId, referenceDate } },
                            create: { enterpriseId, referenceDate, dailyClicks: pending, createAt: new Date(), updateAt: new Date() },
                            update: { dailyClicks: { increment: pending }, updateAt: new Date() }
                        });
                        
                        compensatedAmount = pending;
                        const evalResult = await redis.eval(DECR_LUA_SCRIPT, 1, key, pending);
                        if (evalResult === 0) compensatedAmount = 0;
                    }
                    return { rotatedByUs: false, consolidatedByUs: true, link };
                }

                const actualClicksRegistered = link.countClicks + pending;
                
                await tx.enterpriseUrl.update({
                    where: { id: link.id },
                    data: { active: false, countClicks: actualClicksRegistered, updateAt: new Date() }
                });
                
                if (pending > 0) {
                    const referenceDate = getTodayBRTReferenceDate();
                    await tx.enterpriseCountDailyClicks.upsert({
                        where: { enterpriseId_referenceDate: { enterpriseId, referenceDate } },
                        create: { enterpriseId, referenceDate, dailyClicks: pending, createAt: new Date(), updateAt: new Date() },
                        update: { dailyClicks: { increment: pending }, updateAt: new Date() }
                    });
                    
                    compensatedAmount = pending;
                    const evalResult = await redis.eval(DECR_LUA_SCRIPT, 1, key, pending);
                    if (evalResult === 0) compensatedAmount = 0;
                }

                const activatedLink = await tx.enterpriseUrl.update({
                    where: { id: nextLink.id },
                    data: { active: true, countClicks: 0, updateAt: new Date() }
                });

                return { rotatedByUs: true, consolidatedByUs: false, link: activatedLink };
            });

            if (result.rotatedByUs || result.consolidatedByUs || (!result.rotatedByUs && !result.consolidatedByUs)) {
                await redis.incr(key);
            }

            return result.link.url;
        } catch (err) {
            if (compensatedAmount > 0) {
                await redis.incrby(key, compensatedAmount);
            }
            throw err;
        }
    }

    // Fluxo Normal (MANUAL, TIMER, SCHEDULE)
    await redis.incr(key);
    
    return link.url;
};

export const processClickAndRedirectOnlyEfootball = async (): Promise<string> => {
    const categoryEfootball = await prisma.enterpriseCategory.findFirst({
        where: { name: "efootball" }
    });

    if (!categoryEfootball) {
        throw new AppError("Categoria efootball não cadastrada.", 404);
    }

    const enterpriseId = env.ENTERPRISE_ID_KZN;
    if (!enterpriseId) {
        throw new AppError("EnterpriseId indefinido.", 404);
    }

    return await processClickAndRedirect(enterpriseId, categoryEfootball.id);
};