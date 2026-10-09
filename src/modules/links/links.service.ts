import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/appError";
import type { CreateLinkInput, UpdateLinkInput, ReorderLinksInput } from "../../shared/zod/links.zod";
import { redis } from "../../shared/database/redis";
import { getNextEligibleLink } from "../../shared/utils/linkUtils";
import { env } from "../../shared/config/env";
import { getTodayBRTReferenceDate } from "../../shared/utils/dateUtils";
import { VisitorCookiePayload } from "../../shared/utils/cookie";


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
    try {
        return await prisma.$transaction(async (tx) => {
            // Bloqueio no nível da empresa para garantir concorrência segura na ordem
            await tx.$executeRaw`SELECT id FROM "enterprise" WHERE "id" = ${enterpriseId}::uuid FOR UPDATE`;

            const categoryExists = await tx.enterpriseCategory.findFirst({
                where: { id: data.categoryId, enterpriseId }
            });

            if (!categoryExists) {
                throw new AppError("Categoria não encontrada ou não pertence a esta empresa", 404);
            }


            const maxOrderUrl = await tx.enterpriseUrl.findFirst({
                where: { enterpriseId, categoryId: data.categoryId },
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
                    categoryId: data.categoryId,
                    createAt: new Date(),
                    updateAt: new Date()
                },
                select: linkSelect
            });
        });
    } catch (error: any) {
        if (error.code === 'P2002') {
            throw new AppError("Esta URL já está cadastrada.", 400);
        }
        throw error;
    }
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
    try {
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
    } catch (error: any) {
        if (error.code === 'P2002') {
            throw new AppError("Esta URL já está cadastrada.", 400);
        }
        throw error;
    }
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

                    await tx.urlCountDailyClicks.upsert({
                        where: { enterpriseUrlId_referenceDate: { enterpriseUrlId: currentActive.id, referenceDate } },
                        create: { enterpriseUrlId: currentActive.id, enterpriseId, referenceDate, dailyClicks: pending, createAt: new Date(), updateAt: new Date() },
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

/**
 * Tempo de exclusividade de contabilização de clique por visitante por categoria.
 * Durante esse período, um mesmo `visitorId` não gerará novo incremento
 * na mesma categoria, evitando cliques repetitivos e metralhamento de botão.
 */
export const processClickAndRedirect = async (
    categoryId: string,
    options: {
        influencerSlug?: string;
        shouldCountClick: boolean;
        visitorPayload?: VisitorCookiePayload;
    }
): Promise<{ url: string; updatedVisitorPayload?: VisitorCookiePayload }> => {
    const { influencerSlug, shouldCountClick, visitorPayload } = options;

    const category = await prisma.enterpriseCategory.findUnique({
        where: { id: categoryId }
    });

    if (!category) {
        throw new AppError("Categoria não encontrada.", 404);
    }

    const enterpriseId = category.enterpriseId;

    let shouldActuallyCount = false;
    let updatedVisitorPayload: VisitorCookiePayload | undefined = undefined;

    if (shouldCountClick && visitorPayload) {
        const now = Date.now();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        
        let payloadModifiedByCleanup = false;
        const cleanCategories: Record<string, number> = {};
        
        for (const [catId, timestamp] of Object.entries(visitorPayload.categories)) {
            if (timestamp <= now && (now - timestamp < thirtyDaysMs) && timestamp >= 0) {
                cleanCategories[catId] = timestamp;
            } else {
                payloadModifiedByCleanup = true;
            }
        }
        visitorPayload.categories = cleanCategories;

        const lastClickTimestamp = visitorPayload.categories[categoryId];

        if (!lastClickTimestamp) {
            shouldActuallyCount = true;
            
            // Controle de tamanho máximo para evitar crescer indefinidamente
            const maxCategories = 20;
            let catEntries = Object.entries(visitorPayload.categories);
            if (catEntries.length >= maxCategories) {
                // Ordenar do mais antigo pro mais novo e descartar o mais velho
                catEntries.sort((a, b) => a[1] - b[1]);
                const categoriesToKeep = catEntries.slice(catEntries.length - maxCategories + 1);
                visitorPayload.categories = Object.fromEntries(categoriesToKeep);
            }

            visitorPayload.categories[categoryId] = now;
            updatedVisitorPayload = visitorPayload;
        } else if (payloadModifiedByCleanup) {
            // Mesmo se não contabilizar novo clique, se houve remoção passiva, mandamos salvar o encolhimento
            updatedVisitorPayload = visitorPayload;
        }
    }

    // ─── Busca o link ativo atual da categoria (necessário para todos os casos) ─
    if (!shouldActuallyCount) {
        const activeLink = await prisma.enterpriseUrl.findFirst({
            where: { enterpriseId, categoryId, active: true },
        });

        if (!activeLink) {
            throw new AppError("Nenhum link ativo encontrado para esta categoria.", 404);
        }

        return { url: activeLink.url, updatedVisitorPayload };
    }

    // ─── Fluxo normal de contabilização (visitante inédito) ─────────────────────
    let influencerKeyToRollback: string | null = null;

    if (influencerSlug) {
        try {
            const influencer = await prisma.influencer.findFirst({
                where: { slug: influencerSlug, enterpriseId }
            });
            if (influencer) {
                const influencerKey = `influencer_clicks:${enterpriseId}:${influencer.id}`;
                await redis.incr(influencerKey);
                influencerKeyToRollback = influencerKey;
            }
        } catch (error) {
            console.error(`Erro ao incrementar clique do influenciador ${influencerSlug}:`, error);
        }
    }

    const key = `clicks:${enterpriseId}:${categoryId}`;
    let compensatedAmount = 0;

    try {
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
            return { url: link.url, updatedVisitorPayload };
        }

        let shouldRotate = false;

        if (config.toggleType === "LIMITCLICKS" && config.limitClicks) {
            const luaResult = await redis.eval(CHECK_LIMIT_LUA_SCRIPT, 1, key, link.countClicks, config.limitClicks);
            if (luaResult === -1) {
                shouldRotate = true;
            } else {
                return { url: link.url, updatedVisitorPayload };
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

                return { url: result.link.url, updatedVisitorPayload };
            } catch (err) {
                if (compensatedAmount > 0) {
                    await redis.incrby(key, compensatedAmount);
                }
                throw err;
            }
        }

        // Fluxo Normal (MANUAL, TIMER, SCHEDULE)
        await redis.incr(key);

        return { url: link.url, updatedVisitorPayload };
    } catch (error) {
        if (influencerKeyToRollback) {
            await redis.decr(influencerKeyToRollback).catch(e => console.error("Erro no rollback do influenciador:", e));
        }
        throw error;
    }
};


export const processClickAndRedirectOnlyEfootball = async (): Promise<{ url: string; updatedVisitorPayload?: VisitorCookiePayload }> => {
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

    return await processClickAndRedirect(categoryEfootball.id, { shouldCountClick: false });
};