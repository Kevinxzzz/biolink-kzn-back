"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consolidateClicks = void 0;
const prisma_1 = require("../../shared/database/prisma");
const redis_1 = require("../../shared/database/redis");
const dateUtils_1 = require("../../shared/utils/dateUtils");
const DECR_LUA_SCRIPT = `
    local current = tonumber(redis.call('GET', KEYS[1]) or '0')
    local sub = tonumber(ARGV[1])
    if current >= sub then
        redis.call('DECRBY', KEYS[1], sub)
        return 1
    end
    return 0
`;
const consolidateClicks = async () => {
    let cursor = "0";
    const keysToProcess = [];
    // 1. Varredura no Redis
    do {
        // MATCH clicks:*:* - as chaves são clicks:enterpriseId:categoryId
        const [nextCursor, keys] = await redis_1.redis.scan(cursor, "MATCH", "clicks:*:*", "COUNT", "100");
        cursor = nextCursor;
        keysToProcess.push(...keys);
    } while (cursor !== "0");
    for (const key of keysToProcess) {
        try {
            const parts = key.split(":");
            if (parts.length !== 3)
                continue;
            const [, enterpriseId, categoryId] = parts;
            let compensatedAmount = 0;
            try {
                // 2. Transação no PostgreSQL e Redis combinada
                await prisma_1.prisma.$transaction(async (tx) => {
                    // Lock da Categoria
                    await tx.$executeRaw `SELECT id FROM "enterprise_category" WHERE "id" = ${categoryId}::uuid FOR UPDATE`;
                    // Busca do Link Ativo (autoridade atual da categoria)
                    const activeLink = await tx.enterpriseUrl.findFirst({
                        where: { enterpriseId, categoryId, active: true }
                    });
                    if (!activeLink) {
                        return; // Se não houver link ativo, não consolidamos nesta rodada
                    }
                    // Leitura Segura do Redis dentro do Lock
                    const redisCountStr = await redis_1.redis.get(key);
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
                    const referenceDate = (0, dateUtils_1.getTodayBRTReferenceDate)();
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
                    const evalResult = await redis_1.redis.eval(DECR_LUA_SCRIPT, 1, key, redisCount);
                    if (evalResult === 0) {
                        // Se o script não decrementou, não precisamos compensar
                        compensatedAmount = 0;
                    }
                });
            }
            catch (error) {
                console.error(`Erro ao consolidar cliques da chave ${key}:`, error);
                if (compensatedAmount > 0) {
                    await redis_1.redis.incrby(key, compensatedAmount);
                }
            }
        }
        catch (outerError) {
            console.error(`Erro inesperado no processamento da chave ${key}:`, outerError);
        }
    }
};
exports.consolidateClicks = consolidateClicks;
