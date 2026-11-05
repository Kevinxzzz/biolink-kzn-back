"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dashboard_service_1 = require("./dashboard.service");
const prisma_1 = require("../../shared/database/prisma");
const redis_1 = require("../../shared/database/redis");
const dateUtils_1 = require("../../shared/utils/dateUtils");
const dashboard_zod_1 = require("../../shared/zod/dashboard.zod");
describe("Dashboard Analytics Service", () => {
    let enterpriseAId;
    let enterpriseBId;
    beforeAll(async () => {
        const entA = await prisma_1.prisma.enterprise.create({ data: { name: "Ent A", email: "a@a.com", phoneNumber: "1", createAt: new Date(), updateAt: new Date() } });
        enterpriseAId = entA.id;
        const entB = await prisma_1.prisma.enterprise.create({ data: { name: "Ent B", email: "b@b.com", phoneNumber: "2", createAt: new Date(), updateAt: new Date() } });
        enterpriseBId = entB.id;
    });
    afterAll(async () => {
        await prisma_1.prisma.enterprise.deleteMany({ where: { id: { in: [enterpriseAId, enterpriseBId] } } });
        const keys = await redis_1.redis.keys("clicks:*");
        if (keys.length > 0)
            await redis_1.redis.del(keys);
        const infKeys = await redis_1.redis.keys("influencer_clicks:*");
        if (infKeys.length > 0)
            await redis_1.redis.del(infKeys);
        await prisma_1.prisma.$disconnect();
        await prisma_1.pool.end();
        await redis_1.redis.quit();
    });
    beforeEach(async () => {
        await prisma_1.prisma.enterpriseCountDailyClicks.deleteMany({ where: { enterpriseId: { in: [enterpriseAId, enterpriseBId] } } });
        await prisma_1.prisma.urlCountDailyClicks.deleteMany({ where: { enterpriseId: { in: [enterpriseAId, enterpriseBId] } } });
        await prisma_1.prisma.influencerCountDailyClicks.deleteMany({ where: { influencer: { enterpriseId: { in: [enterpriseAId, enterpriseBId] } } } });
        await prisma_1.prisma.influencer.deleteMany({ where: { enterpriseId: { in: [enterpriseAId, enterpriseBId] } } });
        await prisma_1.prisma.enterpriseCategory.deleteMany({ where: { enterpriseId: { in: [enterpriseAId, enterpriseBId] } } });
        const keys = await redis_1.redis.keys("clicks:*");
        if (keys.length > 0)
            await redis_1.redis.del(keys);
        const infKeys = await redis_1.redis.keys("influencer_clicks:*");
        if (infKeys.length > 0)
            await redis_1.redis.del(infKeys);
    });
    it("Deve bloquear uso simultâneo de linkId e influencerId (Zod 400)", async () => {
        const result = dashboard_zod_1.getDashboardSchema.safeParse({ query: { period: "dia", linkId: "b7e1c8d5-1234-5678-abcd-1234567890ab", influencerId: "b7e1c8d5-1234-5678-abcd-1234567890ab" } });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toMatch(/Filtros simultâneos/i);
        }
    });
    it("Deve retornar apenas PostgreSQL se Redis for 0 ou ausente", async () => {
        const today = (0, dateUtils_1.getTodayBRTReferenceDate)();
        await prisma_1.prisma.enterpriseCountDailyClicks.create({
            data: { enterpriseId: enterpriseAId, referenceDate: today, dailyClicks: 100, createAt: new Date(), updateAt: new Date() }
        });
        const result = await (0, dashboard_service_1.getDashboardService)(enterpriseAId, { period: "dia" });
        expect(result.status.totalClicks).toBe(100);
        expect(result.status.clicksToday).toBe(100);
        expect(result.evolution.find((e) => e.date === today.toISOString().split("T")[0])?.clicks).toBe(100);
    });
    it("Deve somar PostgreSQL e Redis (PG+Redis) para o total da empresa", async () => {
        const today = (0, dateUtils_1.getTodayBRTReferenceDate)();
        await prisma_1.prisma.enterpriseCountDailyClicks.create({
            data: { enterpriseId: enterpriseAId, referenceDate: today, dailyClicks: 100, createAt: new Date(), updateAt: new Date() }
        });
        await redis_1.redis.set(`clicks:${enterpriseAId}:cat1`, "25");
        const result = await (0, dashboard_service_1.getDashboardService)(enterpriseAId, { period: "dia" });
        expect(result.status.totalClicks).toBe(125);
        expect(result.status.clicksToday).toBe(125);
        expect(result.evolution.find((e) => e.date === today.toISOString().split("T")[0])?.clicks).toBe(125);
    });
    it("Deve retornar apenas Redis se PG for 0", async () => {
        await redis_1.redis.set(`clicks:${enterpriseAId}:cat1`, "25");
        const result = await (0, dashboard_service_1.getDashboardService)(enterpriseAId, { period: "dia" });
        expect(result.status.totalClicks).toBe(25);
        expect(result.status.clicksToday).toBe(25);
    });
    it("Deve garantir isolamento de Tenant (Enterprise A não lê Redis da B)", async () => {
        const today = (0, dateUtils_1.getTodayBRTReferenceDate)();
        await prisma_1.prisma.enterpriseCountDailyClicks.create({
            data: { enterpriseId: enterpriseAId, referenceDate: today, dailyClicks: 100, createAt: new Date(), updateAt: new Date() }
        });
        await prisma_1.prisma.enterpriseCountDailyClicks.create({
            data: { enterpriseId: enterpriseBId, referenceDate: today, dailyClicks: 500, createAt: new Date(), updateAt: new Date() }
        });
        await redis_1.redis.set(`clicks:${enterpriseAId}:cat1`, "20");
        await redis_1.redis.set(`clicks:${enterpriseBId}:cat2`, "80");
        const resultA = await (0, dashboard_service_1.getDashboardService)(enterpriseAId, { period: "dia" });
        expect(resultA.status.totalClicks).toBe(120);
        const resultB = await (0, dashboard_service_1.getDashboardService)(enterpriseBId, { period: "dia" });
        expect(resultB.status.totalClicks).toBe(580);
    });
    it("Deve filtrar por Link e NÃO buscar Redis para Link", async () => {
        const today = (0, dateUtils_1.getTodayBRTReferenceDate)();
        const category = await prisma_1.prisma.enterpriseCategory.create({ data: { enterpriseId: enterpriseAId, name: "CatLink", createAt: new Date(), updateAt: new Date() } });
        const linkA = await prisma_1.prisma.enterpriseUrl.create({ data: { title: "Link A", url: "x.com/a", countClicks: 0, active: true, order: 1, enterpriseId: enterpriseAId, categoryId: category.id, createAt: new Date(), updateAt: new Date() } });
        await prisma_1.prisma.urlCountDailyClicks.create({
            data: { enterpriseUrlId: linkA.id, enterpriseId: enterpriseAId, referenceDate: today, dailyClicks: 150, createAt: new Date(), updateAt: new Date() }
        });
        await redis_1.redis.set(`clicks:${enterpriseAId}:${category.id}`, "50"); // Cliques pendentes
        const result = await (0, dashboard_service_1.getDashboardService)(enterpriseAId, { period: "dia", linkId: linkA.id });
        // Link usa apenas PostgreSQL!
        expect(result.status.totalClicks).toBe(150);
    });
    it("Deve filtrar por Influenciador e buscar PG+Redis para o influenciador", async () => {
        const today = (0, dateUtils_1.getTodayBRTReferenceDate)();
        const inf = await prisma_1.prisma.influencer.create({ data: { name: "Inf", slug: "inf", enterpriseId: enterpriseAId, counterEntries: 0, personalUrl: "url", createAt: new Date(), updateAt: new Date() } });
        await prisma_1.prisma.influencerCountDailyClicks.create({
            data: { influencerId: inf.id, referenceDate: today, dailyClicks: 300, createAt: new Date(), updateAt: new Date() }
        });
        await redis_1.redis.set(`influencer_clicks:${enterpriseAId}:${inf.id}`, "75");
        const result = await (0, dashboard_service_1.getDashboardService)(enterpriseAId, { period: "dia", influencerId: inf.id });
        expect(result.status.totalClicks).toBe(375);
    });
    it("Deve preservar a granularidade diária (YYYY-MM-DD) no filtro 'mes'", async () => {
        const today = (0, dateUtils_1.getTodayBRTReferenceDate)();
        const year = today.getUTCFullYear();
        const month = String(today.getUTCMonth() + 1).padStart(2, "0");
        const firstDayOfMonth = new Date(`${year}-${month}-01T00:00:00.000Z`);
        await prisma_1.prisma.enterpriseCountDailyClicks.create({
            data: { enterpriseId: enterpriseAId, referenceDate: firstDayOfMonth, dailyClicks: 40, createAt: new Date(), updateAt: new Date() }
        });
        if (today.getTime() !== firstDayOfMonth.getTime()) {
            await prisma_1.prisma.enterpriseCountDailyClicks.create({
                data: { enterpriseId: enterpriseAId, referenceDate: today, dailyClicks: 60, createAt: new Date(), updateAt: new Date() }
            });
        }
        const result = await (0, dashboard_service_1.getDashboardService)(enterpriseAId, { period: "mes" });
        expect(result.evolution.every((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date))).toBe(true);
        expect(result.evolution.find((e) => e.date === `${year}-${month}-01`)?.clicks).toBe(40);
    });
    it("Deve agrupar e somar por mês (YYYY-MM) no filtro 'ano' para a empresa, preenchendo meses vazios com 0 e somando Redis no mês atual", async () => {
        const today = (0, dateUtils_1.getTodayBRTReferenceDate)();
        const year = today.getUTCFullYear();
        const currentMonth = today.getUTCMonth() + 1;
        const currentMonthKey = `${year}-${String(currentMonth).padStart(2, "0")}`;
        // Registro do ano anterior (não deve entrar no filtro 'ano')
        await prisma_1.prisma.enterpriseCountDailyClicks.create({
            data: { enterpriseId: enterpriseAId, referenceDate: new Date(`${year - 1}-12-31T00:00:00.000Z`), dailyClicks: 999, createAt: new Date(), updateAt: new Date() }
        });
        // Dois dias em janeiro (incluindo 01/01 para garantir startDate em UTC)
        await prisma_1.prisma.enterpriseCountDailyClicks.createMany({
            data: [
                { enterpriseId: enterpriseAId, referenceDate: new Date(`${year}-01-01T00:00:00.000Z`), dailyClicks: 100, createAt: new Date(), updateAt: new Date() },
                { enterpriseId: enterpriseAId, referenceDate: new Date(`${year}-01-20T00:00:00.000Z`), dailyClicks: 150, createAt: new Date(), updateAt: new Date() },
            ]
        });
        // Se o mês atual for > 1, adiciona também cliques no dia de hoje + Redis
        if (currentMonth > 1) {
            await prisma_1.prisma.enterpriseCountDailyClicks.create({
                data: { enterpriseId: enterpriseAId, referenceDate: today, dailyClicks: 80, createAt: new Date(), updateAt: new Date() }
            });
        }
        await redis_1.redis.set(`clicks:${enterpriseAId}:cat1`, "20");
        const result = await (0, dashboard_service_1.getDashboardService)(enterpriseAId, { period: "ano" });
        // Deve conter todos os meses de janeiro até o mês atual em ordem cronológica
        expect(result.evolution).toHaveLength(currentMonth);
        expect(result.evolution.map((e) => e.date)).toEqual(Array.from({ length: currentMonth }, (_, idx) => `${year}-${String(idx + 1).padStart(2, "0")}`));
        if (currentMonth > 1) {
            expect(result.evolution.find((e) => e.date === `${year}-01`)?.clicks).toBe(250);
            expect(result.evolution.find((e) => e.date === currentMonthKey)?.clicks).toBe(100); // 80 PG + 20 Redis
            expect(result.status.totalClicks).toBe(350);
        }
        else {
            expect(result.evolution.find((e) => e.date === `${year}-01`)?.clicks).toBe(270); // 250 PG + 20 Redis
            expect(result.status.totalClicks).toBe(270);
        }
        // Meses intermediários sem registros devem estar preenchidos com 0
        if (currentMonth > 2) {
            expect(result.evolution.find((e) => e.date === `${year}-02`)?.clicks).toBe(0);
        }
    });
    it("Deve agrupar por mês no filtro 'ano' quando filtrado por linkId (sem somar Redis)", async () => {
        const today = (0, dateUtils_1.getTodayBRTReferenceDate)();
        const year = today.getUTCFullYear();
        const currentMonth = today.getUTCMonth() + 1;
        const category = await prisma_1.prisma.enterpriseCategory.create({
            data: { enterpriseId: enterpriseAId, name: "CatAno", createAt: new Date(), updateAt: new Date() }
        });
        const link = await prisma_1.prisma.enterpriseUrl.create({
            data: { title: "Link Ano", url: "https://ano.com", countClicks: 0, active: true, order: 1, enterpriseId: enterpriseAId, categoryId: category.id, createAt: new Date(), updateAt: new Date() }
        });
        await prisma_1.prisma.urlCountDailyClicks.createMany({
            data: [
                { enterpriseUrlId: link.id, enterpriseId: enterpriseAId, referenceDate: new Date(`${year}-01-05T00:00:00.000Z`), dailyClicks: 30, createAt: new Date(), updateAt: new Date() },
                { enterpriseUrlId: link.id, enterpriseId: enterpriseAId, referenceDate: new Date(`${year}-01-18T00:00:00.000Z`), dailyClicks: 70, createAt: new Date(), updateAt: new Date() },
            ]
        });
        await redis_1.redis.set(`clicks:${enterpriseAId}:${category.id}`, "50");
        const result = await (0, dashboard_service_1.getDashboardService)(enterpriseAId, { period: "ano", linkId: link.id });
        expect(result.evolution).toHaveLength(currentMonth);
        expect(result.evolution.find((e) => e.date === `${year}-01`)?.clicks).toBe(100);
        expect(result.status.totalClicks).toBe(100);
    });
    it("Deve agrupar por mês em evolution e influencerEvolution no filtro 'ano' mantendo influenciadores separados e somando Redis no mês atual", async () => {
        const today = (0, dateUtils_1.getTodayBRTReferenceDate)();
        const year = today.getUTCFullYear();
        const currentMonth = today.getUTCMonth() + 1;
        const currentMonthKey = `${year}-${String(currentMonth).padStart(2, "0")}`;
        const inf1 = await prisma_1.prisma.influencer.create({
            data: { name: "Inf Um", slug: "inf-um", enterpriseId: enterpriseAId, counterEntries: 0, personalUrl: "https://a.com/1", createAt: new Date(), updateAt: new Date() }
        });
        const inf2 = await prisma_1.prisma.influencer.create({
            data: { name: "Inf Dois", slug: "inf-dois", enterpriseId: enterpriseAId, counterEntries: 0, personalUrl: "https://a.com/2", createAt: new Date(), updateAt: new Date() }
        });
        await prisma_1.prisma.influencerCountDailyClicks.createMany({
            data: [
                { influencerId: inf1.id, referenceDate: new Date(`${year}-01-02T00:00:00.000Z`), dailyClicks: 40, createAt: new Date(), updateAt: new Date() },
                { influencerId: inf1.id, referenceDate: new Date(`${year}-01-15T00:00:00.000Z`), dailyClicks: 60, createAt: new Date(), updateAt: new Date() },
                { influencerId: inf2.id, referenceDate: new Date(`${year}-01-10T00:00:00.000Z`), dailyClicks: 50, createAt: new Date(), updateAt: new Date() },
            ]
        });
        if (currentMonth > 1) {
            await prisma_1.prisma.influencerCountDailyClicks.create({
                data: { influencerId: inf1.id, referenceDate: today, dailyClicks: 25, createAt: new Date(), updateAt: new Date() }
            });
        }
        await redis_1.redis.set(`influencer_clicks:${enterpriseAId}:${inf1.id}`, "15");
        await redis_1.redis.set(`influencer_clicks:${enterpriseAId}:${inf2.id}`, "10");
        // 1. Sem filtro de influenciador: influencerEvolution deve ter todos os meses e ambos influenciadores separados
        const generalResult = await (0, dashboard_service_1.getDashboardService)(enterpriseAId, { period: "ano" });
        expect(generalResult.influencerEvolution).toHaveLength(currentMonth);
        const janRecord = generalResult.influencerEvolution.find((r) => r.date === `${year}-01`);
        const currentMonthRecord = generalResult.influencerEvolution.find((r) => r.date === currentMonthKey);
        if (currentMonth > 1) {
            expect(janRecord["Inf Um"]).toBe(100);
            expect(janRecord["Inf Dois"]).toBe(50);
            expect(currentMonthRecord["Inf Um"]).toBe(40); // 25 PG + 15 Redis
            expect(currentMonthRecord["Inf Dois"]).toBe(10); // 0 PG + 10 Redis
        }
        else {
            expect(janRecord["Inf Um"]).toBe(115); // 100 PG + 15 Redis
            expect(janRecord["Inf Dois"]).toBe(60); // 50 PG + 10 Redis
        }
        if (currentMonth > 2) {
            const febRecord = generalResult.influencerEvolution.find((r) => r.date === `${year}-02`);
            expect(febRecord["Inf Um"]).toBe(0);
            expect(febRecord["Inf Dois"]).toBe(0);
        }
        // 2. Com filtro de influencerId: evolution e influencerEvolution devem refletir apenas inf1 agrupado por mês
        const filteredResult = await (0, dashboard_service_1.getDashboardService)(enterpriseAId, { period: "ano", influencerId: inf1.id });
        expect(filteredResult.evolution).toHaveLength(currentMonth);
        if (currentMonth > 1) {
            expect(filteredResult.evolution.find((e) => e.date === `${year}-01`)?.clicks).toBe(100);
            expect(filteredResult.evolution.find((e) => e.date === currentMonthKey)?.clicks).toBe(40);
            expect(filteredResult.status.totalClicks).toBe(140);
        }
    });
});
