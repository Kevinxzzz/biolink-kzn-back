import { prisma } from "../shared/database/prisma";
import { redis } from "../shared/database/redis";
import { processClickAndRedirect } from "../modules/links/links.service";
import { consolidateClicks } from "../modules/cronIncrement/cronIncrement.service";

describe("Concurrency Integration Tests", () => {
    let enterpriseId: string;
    let categoryId: string;
    let linkAId: string;
    let linkBId: string;

    beforeAll(async () => {
        // Clear tables
        await prisma.enterpriseUrl.deleteMany();
        await prisma.urlSchedule.deleteMany();
        await prisma.categoryRotation.deleteMany();
        await prisma.enterpriseCategory.deleteMany();
        await prisma.enterprise.deleteMany();

        // Create initial data
        const enterprise = await prisma.enterprise.create({
            data: {
                name: "Test Enterprise",
                email: "test-" + Date.now() + "@test.com",
                phoneNumber: "123456789" + Math.floor(Math.random() * 100),
                createAt: new Date(),
                updateAt: new Date()
            }
        });
        enterpriseId = enterprise.id;

        const category = await prisma.enterpriseCategory.create({
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
        // Clear links and rotation settings for each test
        await prisma.enterpriseUrl.deleteMany();
        await prisma.categoryRotation.deleteMany();
        await redis.flushall();

        // Setup 2 links
        const linkA = await prisma.enterpriseUrl.create({
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

        const linkB = await prisma.enterpriseUrl.create({
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

    afterAll(async () => {
        await prisma.enterpriseUrl.deleteMany();
        await prisma.urlSchedule.deleteMany();
        await prisma.categoryRotation.deleteMany();
        await prisma.enterpriseCategory.deleteMany();
        await prisma.enterprise.deleteMany();
        await prisma.$disconnect();
        await redis.quit();
    });

    describe("1. Teste de Stress LIMITCLICKS", () => {
        it("deve rotacionar e consolidar 100 requisições simultâneas de forma segura", async () => {
            // Configurar limite de 50
            await prisma.categoryRotation.create({
                data: {
                    categoryId,
                    toggleType: "LIMITCLICKS",
                    limitClicks: 50,
                    updateAt: new Date()
                }
            });

            // Mock Redis já com 49 cliques
            const key = `clicks:${enterpriseId}:${categoryId}`;
            await redis.set(key, 49);

            // Disparar 100 cliques simultâneos
            const promises = [];
            for (let i = 0; i < 100; i++) {
                promises.push(processClickAndRedirect(enterpriseId, categoryId));
            }

            const results = await Promise.all(promises);

            // Obter links
            const finalLinkA = await prisma.enterpriseUrl.findUnique({ where: { id: linkAId } });
            const finalLinkB = await prisma.enterpriseUrl.findUnique({ where: { id: linkBId } });
            const finalRedisCount = await redis.get(key);

            // Link A deve estar desativado e com exatos 50 cliques (49 + 1)
            expect(finalLinkA?.active).toBe(false);
            expect(finalLinkA?.countClicks).toBe(50);

            // Link B deve estar ativo e com 0 cliques (no banco, pois os cliques estão no Redis)
            expect(finalLinkB?.active).toBe(true);
            expect(finalLinkB?.countClicks).toBe(0);

            // O Redis deve conter exatamente 99 cliques para o Link B (1 clique fechou os 50, 99 sobraram)
            expect(parseInt(finalRedisCount || "0", 10)).toBe(99);
        });
    });

    describe("2. Concorrência Cron vs Redirect", () => {
        it("A. cronIncrement vs processClickAndRedirect simultâneos", async () => {
            const key = `clicks:${enterpriseId}:${categoryId}`;
            await redis.set(key, 50);

            const promises = [];
            for (let i = 0; i < 50; i++) {
                promises.push(processClickAndRedirect(enterpriseId, categoryId));
            }
            promises.push(consolidateClicks());

            await Promise.all(promises);

            const finalLinkA = await prisma.enterpriseUrl.findUnique({ where: { id: linkAId } });
            const redisStr = await redis.get(key);
            const redisCount = redisStr ? parseInt(redisStr, 10) : 0;

            // Ao final, a soma do PostgreSQL + Redis deve ser exatamente 100
            expect(finalLinkA?.countClicks! + redisCount).toBe(100);
        });
    });

    describe("3. Crash Simulate entre Redis e PostgreSQL", () => {
        it("deve acionar compensação do At-Least-Once se PostgreSQL falhar após decremento do Redis", async () => {
            const key = `clicks:${enterpriseId}:${categoryId}`;
            await redis.set(key, 100);

            const originalEval = redis.eval.bind(redis);
            jest.spyOn(redis, 'eval').mockImplementationOnce(async (...args) => {
                const res = await originalEval(...args);
                // Simulamos um erro acontecendo logo após a avaliação do redis (ex: falha no COMMIT final)
                throw new Error("Simulated Database Crash inside transaction");
            });

            try {
                await consolidateClicks();
            } catch (err) {
                // Expected error
            }

            // O Redis deve ter sido compensado e retornado a 100
            const redisStr = await redis.get(key);
            expect(redisStr).toBe("100");

            // Restore mock
            jest.restoreAllMocks();
        });
    });
});
