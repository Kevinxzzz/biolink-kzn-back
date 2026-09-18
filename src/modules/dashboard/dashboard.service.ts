import { prisma } from "../../shared/database/prisma";
import { redis } from "../../shared/database/redis";
import { getTodayBRTReferenceDate } from "../../shared/utils/dateUtils";
import type { DashboardFilters } from "../../shared/types/dashboard.type"

export const getDashboardService = async (enterpriseId: string, filters: DashboardFilters) => {
    const { period, linkId, influencerId } = filters;
    const today = getTodayBRTReferenceDate();

    // Determina o período de filtro
    let startDate = new Date(today);
    if (period === "dia") {
        startDate.setDate(today.getDate() - 1); // Exemplo: Últimos 2 dias ou hoje
    } else if (period === "mes") {
        startDate.setDate(1); // Início do mês atual
    } else if (period === "ano") {
        startDate.setMonth(0, 1); // Início do ano atual
    }

    // 1. Obter "Cliques Hoje" do PostgreSQL (Independente do filtro de período, mas dependente do filtro de dimensão)
    let pgTodayClicks = 0;

    if (linkId) {
        const urlToday = await prisma.urlCountDailyClicks.findFirst({
            where: { enterpriseId, enterpriseUrlId: linkId, referenceDate: today }
        });
        pgTodayClicks = urlToday?.dailyClicks || 0;
    } else if (influencerId) {
        const infToday = await prisma.influencerCountDailyClicks.findFirst({
            where: { influencerId, referenceDate: today }
        });
        pgTodayClicks = infToday?.dailyClicks || 0;
    } else {
        const entToday = await prisma.enterpriseCountDailyClicks.findFirst({
            where: { enterpriseId, referenceDate: today }
        });
        pgTodayClicks = entToday?.dailyClicks || 0;
    }

    // 2. Obter Pendentes do Redis (Para Hoje)
    let redisPendingClicks = 0;

    if (linkId) {
        // Para link, a fonte de verdade é exclusivamente PostgreSQL, conforme regra de negócio e rotação.
        redisPendingClicks = 0;
    } else if (influencerId) {
        const redisVal = await redis.get(`influencer_clicks:${enterpriseId}:${influencerId}`);
        redisPendingClicks = redisVal ? parseInt(redisVal, 10) : 0;
    } else {
        // Geral da empresa: Somar todos os pendentes de todas as categorias
        let cursor = "0";
        do {
            const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `clicks:${enterpriseId}:*`, "COUNT", "100");
            cursor = nextCursor;
            if (keys.length > 0) {
                const values = await redis.mget(keys);
                for (const val of values) {
                    if (val) redisPendingClicks += parseInt(val, 10);
                }
            }
        } while (cursor !== "0");
    }

    const clicksToday = pgTodayClicks + redisPendingClicks;

    // 3. Obter Histórico do Período no PostgreSQL
    let pgPeriodClicks = 0;
    let rawEvolution: any[] = [];

    if (linkId) {
        const data = await prisma.urlCountDailyClicks.findMany({
            where: { enterpriseId, enterpriseUrlId: linkId, referenceDate: { gte: startDate } },
            orderBy: { referenceDate: 'asc' }
        });
        pgPeriodClicks = data.reduce((acc, curr) => acc + curr.dailyClicks, 0);
        rawEvolution = data;
    } else if (influencerId) {
        const data = await prisma.influencerCountDailyClicks.findMany({
            where: { influencerId, referenceDate: { gte: startDate } },
            orderBy: { referenceDate: 'asc' }
        });
        // Validação adicional: garantir que o influencer pertence à enterprise
        const influencer = await prisma.influencer.findFirst({ where: { id: influencerId, enterpriseId } });
        if (influencer) {
            pgPeriodClicks = data.reduce((acc, curr) => acc + curr.dailyClicks, 0);
            rawEvolution = data;
        }
    } else {
        const data = await prisma.enterpriseCountDailyClicks.findMany({
            where: { enterpriseId, referenceDate: { gte: startDate } },
            orderBy: { referenceDate: 'asc' }
        });
        pgPeriodClicks = data.reduce((acc, curr) => acc + curr.dailyClicks, 0);
        rawEvolution = data;
    }

    // Total de Clicks do Período = PG Período + Redis Pendente (se hoje estiver incluso no período)
    const isTodayInPeriod = today >= startDate;
    const totalClicks = pgPeriodClicks + (isTodayInPeriod ? redisPendingClicks : 0);

    // Formatar Evolução
    const evolutionMap = new Map<string, number>();
    for (const record of rawEvolution) {
        const dateKey = record.referenceDate.toISOString().split("T")[0];
        evolutionMap.set(dateKey, record.dailyClicks);
    }

    if (isTodayInPeriod && redisPendingClicks > 0) {
        const todayStr = today.toISOString().split("T")[0];
        const currentTodayVal = evolutionMap.get(todayStr) || 0;
        evolutionMap.set(todayStr, currentTodayVal + redisPendingClicks);
    }

    const evolution = Array.from(evolutionMap.entries()).map(([date, clicks]) => ({ date, clicks }));

    // 4. Rankings — sempre pelo período, ignorando filtros dimensionais (linkId / influencerId)
    type TopLinkItem = { id: string; title: string; url: string; clicks: number };
    type TopInfluencerItem = { id: string; name: string; clicks: number };

    const linkRankData = await prisma.urlCountDailyClicks.groupBy({
        by: ['enterpriseUrlId'],
        where: { enterpriseId, referenceDate: { gte: startDate } },
        _sum: { dailyClicks: true },
        orderBy: { _sum: { dailyClicks: 'desc' } },
        take: 5
    });

    const topLinks: TopLinkItem[] = [];
    for (const item of linkRankData) {
        const urlInfo = await prisma.enterpriseUrl.findUnique({
            where: { id: item.enterpriseUrlId },
            select: { id: true, title: true, url: true }
        });
        if (urlInfo) {
            topLinks.push({ id: urlInfo.id, title: urlInfo.title, url: urlInfo.url, clicks: item._sum.dailyClicks || 0 });
        }
    }

    const allInfluencersForRanking = await prisma.influencer.findMany({
        where: { enterpriseId },
        select: { id: true, name: true }
    });

    const topInfluencersRaw: TopInfluencerItem[] = [];
    for (const inf of allInfluencersForRanking) {
        const pgClicksRaw = await prisma.influencerCountDailyClicks.aggregate({
            where: { influencerId: inf.id, referenceDate: { gte: startDate } },
            _sum: { dailyClicks: true }
        });
        let clicks = pgClicksRaw._sum.dailyClicks || 0;

        if (isTodayInPeriod) {
            const pend = await redis.get(`influencer_clicks:${enterpriseId}:${inf.id}`);
            if (pend) clicks += parseInt(pend, 10);
        }

        topInfluencersRaw.push({ id: inf.id, name: inf.name, clicks });
    }

    const topInfluencers = topInfluencersRaw.sort((a, b) => b.clicks - a.clicks).slice(0, 5);

    // 5. All Links — todos os links da empresa (ativos e inativos), organizados alfabeticamente por título,
    //    reutilizados tanto no filtro quanto no Status do Sistema (filtrado localmente no frontend).
    const allLinksData = await prisma.enterpriseUrl.findMany({
        where: { enterpriseId },
        select: {
            id: true,
            title: true,
            url: true,
            active: true,
            enterpriseCategory: { select: { name: true } }
        },
        orderBy: { title: 'asc' }
    });

    const allLinks = allLinksData.map(l => ({
        id: l.id,
        title: l.title,
        url: l.url,
        active: l.active,
        category: { name: l.enterpriseCategory.name }
    }));

    // 6. All Influencers (for dropdown)
    const allInfluencers = await prisma.influencer.findMany({
        where: { enterpriseId },
        select: { id: true, name: true }
    });

    // 7. Influencer Evolution — respeita filtro de influenciador, ignora linkId
    const influencerEvolutionMap = new Map<string, Record<string, string | number>>();

    for (const dateKey of evolutionMap.keys()) {
        influencerEvolutionMap.set(dateKey, { date: dateKey });
    }

    const infEvolutionWhere = influencerId
        ? { influencerId, referenceDate: { gte: startDate } }
        : { influencer: { enterpriseId }, referenceDate: { gte: startDate } };

    const allInfClicks = await prisma.influencerCountDailyClicks.findMany({
        where: infEvolutionWhere,
        include: { influencer: { select: { id: true, name: true } } }
    });

    for (const click of allInfClicks) {
        const dateKey = click.referenceDate.toISOString().split("T")[0];
        if (!influencerEvolutionMap.has(dateKey)) {
            influencerEvolutionMap.set(dateKey, { date: dateKey });
        }
        const record = influencerEvolutionMap.get(dateKey)!;
        record[click.influencer.name] = (record[click.influencer.name] as number || 0) + click.dailyClicks;
    }

    if (isTodayInPeriod) {
        const todayStr = today.toISOString().split("T")[0];
        if (!influencerEvolutionMap.has(todayStr)) {
            influencerEvolutionMap.set(todayStr, { date: todayStr });
        }
        const record = influencerEvolutionMap.get(todayStr)!;

        const infTargets = influencerId
            ? allInfluencers.filter(inf => inf.id === influencerId)
            : allInfluencers;

        for (const inf of infTargets) {
            const pend = await redis.get(`influencer_clicks:${enterpriseId}:${inf.id}`);
            if (pend) {
                record[inf.name] = (record[inf.name] as number || 0) + parseInt(pend, 10);
            }
        }
    }

    const influencerEvolution = Array.from(influencerEvolutionMap.values()).sort((a, b) =>
        (a.date as string).localeCompare(b.date as string)
    );

    return {
        status: { totalClicks, clicksToday },
        evolution,
        topLinks,
        topInfluencers,
        allLinks,
        allInfluencers,
        influencerEvolution
    };
};

export default getDashboardService;
