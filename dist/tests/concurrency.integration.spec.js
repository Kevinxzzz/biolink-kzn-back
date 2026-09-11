"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../shared/database/prisma");
const redis_1 = require("../shared/database/redis");
const links_service_1 = require("../modules/links/links.service");
const cronIncrement_service_1 = require("../modules/cronIncrement/cronIncrement.service");
jest.setTimeout(15000);
describe("Concurrency Integration Tests", () => {
    let enterpriseId;
    let categoryId;
    let linkAId;
    let linkBId;
    let applicationId;
    let domain = "test.com";
    beforeAll(async () => {
        // Clear previous test enterprise and application if exists
        const oldApp = await prisma_1.prisma.application.findUnique({ where: { domain } });
        if (oldApp) {
            await prisma_1.prisma.enterprise.deleteMany({ where: { applicationId: oldApp.id } });
            await prisma_1.prisma.application.delete({ where: { id: oldApp.id } });
        }
        // Create initial data
        const app = await prisma_1.prisma.application.create({
            data: {
                name: "Test App",
                domain: domain,
                createAt: new Date(),
                updateAt: new Date()
            }
        });
        applicationId = app.id;
        const enterprise = await prisma_1.prisma.enterprise.create({
            data: {
                name: "Test Enterprise",
                email: "test-" + Date.now() + "@test.com",
                phoneNumber: "123456789" + Math.floor(Math.random() * 100),
                applicationId: applicationId,
                createAt: new Date(),
                updateAt: new Date()
            }
        });
        enterpriseId = enterprise.id;
        const category = await prisma_1.prisma.enterpriseCategory.create({
            data: {
                name: "efootball",
                enterpriseId: enterpriseId,
                createAt: new Date(),
                updateAt: new Date()
            }
        });
        categoryId = category.id;
    });
    beforeEach(async () => {
        // Clear links and rotation settings for this test
        await prisma_1.prisma.enterpriseUrl.deleteMany({ where: { enterpriseId } });
        await prisma_1.prisma.categoryRotation.deleteMany({ where: { categoryId } });
        await redis_1.redis.flushall();
        // Setup 2 links
        const linkA = await prisma_1.prisma.enterpriseUrl.create({
            data: {
                title: "Link A",
                url: "http://linka.com",
                order: 1,
                active: true,
                countClicks: 0,
                inRotationPool: true,
                enterpriseId,
                categoryId,
                createAt: new Date(),
                updateAt: new Date()
            }
        });
        linkAId = linkA.id;
        const linkB = await prisma_1.prisma.enterpriseUrl.create({
            data: {
                title: "Link B",
                url: "http://linkb.com",
                order: 2,
                active: false,
                countClicks: 0,
                inRotationPool: true,
                enterpriseId,
                categoryId,
                createAt: new Date(),
                updateAt: new Date()
            }
        });
        linkBId = linkB.id;
    });
    describe("1. Teste de Stress LIMITCLICKS", () => {
        it("deve rotacionar e consolidar 2 requisições simultâneas de forma segura", async () => {
            await prisma_1.prisma.categoryRotation.create({
                data: { categoryId, toggleType: "LIMITCLICKS", limitClicks: 50, updateAt: new Date() }
            });
            const key = `clicks:${enterpriseId}:${categoryId}`;
            await redis_1.redis.set(key, 49);
            const promises = [];
            for (let i = 0; i < 2; i++) {
                promises.push((0, links_service_1.processClickAndRedirect)(domain, categoryId));
            }
            await Promise.all(promises);
            const finalLinkA = await prisma_1.prisma.enterpriseUrl.findUnique({ where: { id: linkAId } });
            const finalLinkB = await prisma_1.prisma.enterpriseUrl.findUnique({ where: { id: linkBId } });
            const finalRedisCount = await redis_1.redis.get(key);
            expect(finalLinkA?.active).toBe(false);
            expect(finalLinkA?.countClicks).toBe(50);
            expect(finalLinkB?.active).toBe(true);
            expect(finalLinkB?.countClicks).toBe(0);
            expect(parseInt(finalRedisCount || "0", 10)).toBe(1);
        });
    });
    describe("2. Concorrência Cron vs Redirect", () => {
        it("A. cronIncrement vs processClickAndRedirect simultâneos", async () => {
            const key = `clicks:${enterpriseId}:${categoryId}`;
            await redis_1.redis.set(key, 10);
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push((0, links_service_1.processClickAndRedirect)(domain, categoryId));
            }
            promises.push((0, cronIncrement_service_1.consolidateClicks)());
            await Promise.all(promises);
            const finalLinkA = await prisma_1.prisma.enterpriseUrl.findUnique({ where: { id: linkAId } });
            const redisStr = await redis_1.redis.get(key);
            const redisCount = redisStr ? parseInt(redisStr, 10) : 0;
            expect(finalLinkA?.countClicks + redisCount).toBe(15);
        });
    });
    describe("3. Crash Simulate entre Redis e PostgreSQL", () => {
        it("deve acionar compensação do At-Least-Once se PostgreSQL falhar após decremento do Redis", async () => {
            const key = `clicks:${enterpriseId}:${categoryId}`;
            await redis_1.redis.set(key, 100);
            const originalEval = redis_1.redis.eval.bind(redis_1.redis);
            jest.spyOn(redis_1.redis, 'eval').mockImplementationOnce(async (...args) => {
                const res = await originalEval(...args);
                // Simulamos um erro acontecendo logo após a avaliação do redis (ex: falha no COMMIT final)
                throw new Error("Simulated Database Crash inside transaction");
            });
            try {
                await (0, cronIncrement_service_1.consolidateClicks)();
            }
            catch (err) {
                // Expected error
            }
            // O Redis deve ter sido compensado e retornado a 100
            const redisStr = await redis_1.redis.get(key);
            expect(redisStr).toBe("100");
            // Restore mock
            jest.restoreAllMocks();
        });
    });
    afterAll(async () => {
        if (enterpriseId) {
            await prisma_1.prisma.enterprise.deleteMany({ where: { id: enterpriseId } });
        }
        if (applicationId) {
            await prisma_1.prisma.application.deleteMany({ where: { id: applicationId } });
        }
        await prisma_1.prisma.$disconnect();
        await prisma_1.pool.end();
        redis_1.redis.disconnect();
    });
});
