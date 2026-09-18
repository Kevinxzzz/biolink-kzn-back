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
        await prisma_1.prisma.enterprise.deleteMany({});
        const keys = await redis_1.redis.keys("clicks:*");
        if (keys.length > 0)
            await redis_1.redis.del(keys);
        const infKeys = await redis_1.redis.keys("influencer_clicks:*");
        if (infKeys.length > 0)
            await redis_1.redis.del(infKeys);
    });
    beforeEach(async () => {
        await prisma_1.prisma.enterpriseCountDailyClicks.deleteMany({});
        await prisma_1.prisma.urlCountDailyClicks.deleteMany({});
        await prisma_1.prisma.influencerCountDailyClicks.deleteMany({});
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
});
