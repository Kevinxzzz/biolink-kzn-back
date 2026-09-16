import { prisma } from "../../shared/database/prisma";
import { redis } from "../../shared/database/redis";
import { AppError } from "../../shared/errors/appError";
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

export const consolidateClicks = async () => {
    let cursor = "0";

    // 1. Varredura no Redis e processamento em lotes (chunks)
    do {
        // MATCH clicks:*:* - as chaves são clicks:enterpriseId:categoryId
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "clicks:*:*", "COUNT", "100");
        cursor = nextCursor;
        
        // Processa as chaves recebidas neste lote imediatamente
        for (const key of keys) {
            try {
                const parts = key.split(":");
                if (parts.length !== 3) continue;

                const [, enterpriseId, categoryId] = parts;
                let compensatedAmount = 0;

                try {
                    // 2. Transação no PostgreSQL e Redis combinada
                    await prisma.$transaction(async (tx) => {
                        // Lock da Categoria
                        await tx.$executeRaw`SELECT id FROM "enterprise_category" WHERE "id" = ${categoryId}::uuid FOR UPDATE`;

                        // Busca do Link Ativo (autoridade atual da categoria)
                        const activeLink = await tx.enterpriseUrl.findFirst({
                            where: { enterpriseId, categoryId, active: true }
                        });

                        if (!activeLink) {
                            return; // Se não houver link ativo, não consolidamos nesta rodada
                        }

                        // Leitura Segura do Redis dentro do Lock
                        const redisCountStr = await redis.get(key);
                        const redisCount = redisCountStr ? parseInt(redisCountStr, 10) : 0;

                        if (redisCount <= 0) {
                            return; // Nada a consolidar
                        }

                        // Incremento no Link
                        await tx.enterpriseUrl.update({
                            where: { id: activeLink.id },
                            data: {
                                countClicks: { increment: redisCount },
                                updateAt: new Date()
                            }
                        });

                        // Atualização Diária (Timezone Seguro BRT)
                        const referenceDate = getTodayBRTReferenceDate();

                        await tx.enterpriseCountDailyClicks.upsert({
                            where: {
                                enterpriseId_referenceDate: {
                                    enterpriseId,
                                    referenceDate
                                }
                            },
                            create: {
                                enterpriseId,
                                referenceDate,
                                dailyClicks: redisCount,
                                createAt: new Date(),
                                updateAt: new Date()
                            },
                            update: {
                                dailyClicks: { increment: redisCount },
                                updateAt: new Date()
                            }
                        });

                        // Decremento no Redis (Dentro do Lock do PG)
                        compensatedAmount = redisCount;
                        const evalResult = await redis.eval(DECR_LUA_SCRIPT, 1, key, redisCount);
                        if (evalResult === 0) {
                            // Se o script não decrementou, não precisamos compensar
                            compensatedAmount = 0;
                        }
                    });
                } catch (error) {
                    console.error(`Erro ao consolidar cliques da chave ${key}:`, error);
                    if (compensatedAmount > 0) {
                        await redis.incrby(key, compensatedAmount);
                    }
                }
            } catch (outerError) {
                console.error(`Erro inesperado no processamento da chave ${key}:`, outerError);
            }
        }
    } while (cursor !== "0");
};

export const consolidateInfluencerClicks = async () => {
    let cursor = "0";

    do {
        // MATCH influencer_clicks:*:* - as chaves são influencer_clicks:enterpriseId:influencerId
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "influencer_clicks:*:*", "COUNT", "100");
        cursor = nextCursor;
        
        for (const key of keys) {
            try {
                const parts = key.split(":");
                if (parts.length !== 3) continue;

                const [, enterpriseId, influencerId] = parts;
                let compensatedAmount = 0;

                try {
                    await prisma.$transaction(async (tx) => {
                        // Verifica a existência do influenciador e que ele pertence ao tenant
                        const existingInfluencer = await tx.influencer.findFirst({
                            where: { id: influencerId, enterpriseId }
                        });
                        
                        if (!existingInfluencer) {
                            // Regra: influencer não existe (deletado ou inválido)
                            // Removemos a chave órfã para não reprocessá-la eternamente.
                            await redis.del(key);
                            return; 
                        }

                        // Lock do Influenciador
                        await tx.$executeRaw`SELECT id FROM "influencer" WHERE "id" = ${influencerId}::uuid AND "enterprise_id" = ${enterpriseId}::uuid FOR UPDATE`;

                        // Leitura Segura do Redis
                        const redisCountStr = await redis.get(key);
                        const redisCount = redisCountStr ? parseInt(redisCountStr, 10) : 0;

                        if (redisCount <= 0) {
                            return; // Nada a consolidar
                        }

                        // Incremento no Histórico do Influencer (counterEntries)
                        await tx.influencer.update({
                            where: { id: influencerId },
                            data: {
                                counterEntries: { increment: redisCount },
                                updateAt: new Date()
                            }
                        });

                        // Atualização Diária (Timezone Seguro BRT)
                        const referenceDate = getTodayBRTReferenceDate();

                        await tx.influencerCountDailyClicks.upsert({
                            where: {
                                influencerId_referenceDate: {
                                    influencerId,
                                    referenceDate
                                }
                            },
                            create: {
                                dailyClicks: redisCount,
                                referenceDate,
                                influencerId,
                                createAt: new Date(),
                                updateAt: new Date()
                            },
                            update: {
                                dailyClicks: { increment: redisCount },
                                updateAt: new Date()
                            }
                        });

                        // Decremento no Redis usando LUA Script
                        compensatedAmount = redisCount;
                        const evalResult = await redis.eval(DECR_LUA_SCRIPT, 1, key, redisCount);
                        if (evalResult === 0) {
                            // Se o script não decrementou por algum motivo (embora muito improvável aqui), evitamos compensar
                            compensatedAmount = 0;
                        }
                    });
                } catch (error) {
                    console.error(`Erro ao consolidar cliques da chave do influenciador ${key}:`, error);
                    if (compensatedAmount > 0) {
                        await redis.incrby(key, compensatedAmount);
                    }
                }
            } catch (outerError) {
                console.error(`Erro inesperado no processamento da chave do influenciador ${key}:`, outerError);
            }
        }
    } while (cursor !== "0");
};
