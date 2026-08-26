"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const links_service_1 = require("./links.service");
const prisma_1 = require("../../shared/database/prisma");
const redis_1 = require("../../shared/database/redis");
const links_zod_1 = require("../../shared/zod/links.zod");
jest.mock("../../shared/database/prisma", () => ({
    prisma: {
        $transaction: jest.fn(),
        $executeRaw: jest.fn(),
        enterpriseCategory: {
            findFirst: jest.fn(),
        },
        enterpriseUrl: {
            count: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            delete: jest.fn()
        },
        categoryRotation: {
            findFirst: jest.fn()
        },
        enterpriseCountDailyClicks: {
            upsert: jest.fn()
        }
    }
}));
jest.mock("../../shared/database/redis", () => ({
    redis: {
        get: jest.fn(),
        set: jest.fn(),
        incr: jest.fn(),
        eval: jest.fn(),
        incrby: jest.fn()
    }
}));
describe("Links Module", () => {
    let mockTx;
    beforeEach(() => {
        mockTx = {
            $executeRaw: jest.fn(),
            enterpriseCategory: {
                findFirst: jest.fn()
            },
            enterpriseUrl: {
                count: jest.fn(),
                findFirst: jest.fn(),
                findMany: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                updateMany: jest.fn()
            },
            enterpriseCountDailyClicks: {
                upsert: jest.fn()
            }
        };
        prisma_1.prisma.$transaction.mockImplementation(async (cb) => {
            return await cb(mockTx);
        });
        jest.clearAllMocks();
    });
    describe("CRUD", () => {
        it("deve criar um link e incrementar a ordem", async () => {
            mockTx.enterpriseCategory.findFirst.mockResolvedValue({ id: "cat1", name: "efootball" });
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ order: 5 });
            mockTx.enterpriseUrl.create.mockResolvedValue({ id: "link1", order: 6 });
            const result = await (0, links_service_1.createLink)("ent1", { title: "Test", url: "http://test.com" });
            expect(mockTx.enterpriseCategory.findFirst).toHaveBeenCalledWith({
                where: { name: "efootball" }
            });
            expect(mockTx.enterpriseUrl.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ order: 6, enterpriseId: "ent1", categoryId: "cat1", countClicks: 0, active: false }),
                select: expect.any(Object)
            });
            expect(result.order).toBe(6);
        });
        it("deve listar links com enterpriseId correto", async () => {
            prisma_1.prisma.enterpriseUrl.findMany.mockResolvedValue([{ id: "link1", active: false, countClicks: 0 }]);
            const result = await (0, links_service_1.getLinks)("ent1");
            expect(prisma_1.prisma.enterpriseUrl.findMany).toHaveBeenCalledWith({
                where: { enterpriseId: "ent1", categoryId: undefined },
                select: expect.any(Object),
                orderBy: [{ categoryId: "asc" }, { order: "asc" }]
            });
            expect(result.length).toBe(1);
        });
        it("deve somar cliques do Redis somente para o link ativo e não alterar inativos", async () => {
            prisma_1.prisma.enterpriseUrl.findMany.mockResolvedValue([
                { id: "linkA", categoryId: "cat1", active: true, countClicks: 10 },
                { id: "linkB", categoryId: "cat1", active: false, countClicks: 25 },
                { id: "linkC", categoryId: "cat1", active: false, countClicks: 8 },
            ]);
            redis_1.redis.get.mockResolvedValue("5");
            const result = await (0, links_service_1.getLinks)("ent1", "cat1");
            expect(redis_1.redis.get).toHaveBeenCalledWith("clicks:ent1:cat1");
            expect(result).toEqual([
                { id: "linkA", categoryId: "cat1", active: true, countClicks: 15 },
                { id: "linkB", categoryId: "cat1", active: false, countClicks: 25 },
                { id: "linkC", categoryId: "cat1", active: false, countClicks: 8 },
            ]);
            // Garante que não realiza alterações no Redis ou banco
            expect(redis_1.redis.set).not.toHaveBeenCalled();
            expect(redis_1.redis.incr).not.toHaveBeenCalled();
            expect(prisma_1.prisma.enterpriseUrl.update).not.toHaveBeenCalled();
        });
        it("deve retornar apenas o countClicks do PostgreSQL se link ativo não possuir contador no Redis", async () => {
            prisma_1.prisma.enterpriseUrl.findMany.mockResolvedValue([
                { id: "linkA", categoryId: "cat1", active: true, countClicks: 10 }
            ]);
            redis_1.redis.get.mockResolvedValue(null);
            const result = await (0, links_service_1.getLinks)("ent1", "cat1");
            expect(result[0].countClicks).toBe(10);
        });
        it("deve isolar contadores de categorias e empresas distintas no Redis", async () => {
            prisma_1.prisma.enterpriseUrl.findMany.mockResolvedValue([
                { id: "linkA1", categoryId: "catA", active: true, countClicks: 10 },
                { id: "linkB1", categoryId: "catB", active: true, countClicks: 20 }
            ]);
            redis_1.redis.get.mockImplementation((key) => {
                if (key === "clicks:ent1:catA")
                    return Promise.resolve("7");
                if (key === "clicks:ent1:catB")
                    return Promise.resolve("3");
                return Promise.resolve(null);
            });
            const result = await (0, links_service_1.getLinks)("ent1");
            expect(redis_1.redis.get).toHaveBeenCalledWith("clicks:ent1:catA");
            expect(redis_1.redis.get).toHaveBeenCalledWith("clicks:ent1:catB");
            expect(result[0].countClicks).toBe(17);
            expect(result[1].countClicks).toBe(23);
        });
    });
    describe("Ativação", () => {
        it("deve ativar um link, desativar o atual e resetar countClicks, consolidando redis", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValueOnce({ id: "link1", categoryId: "cat1", enterpriseId: "ent1", inRotationPool: true, countClicks: 800 });
            mockTx.enterpriseUrl.findFirst.mockResolvedValueOnce({ id: "link2", categoryId: "cat1", enterpriseId: "ent1", active: true, countClicks: 100 });
            redis_1.redis.get.mockResolvedValue("50");
            redis_1.redis.eval.mockResolvedValue(1);
            mockTx.enterpriseUrl.update.mockResolvedValue({ id: "link1", active: true, countClicks: 0 });
            const result = await (0, links_service_1.activateLink)("link1", "ent1");
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "link2" },
                data: { countClicks: { increment: 50 }, active: false, updateAt: expect.any(Date) }
            });
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "link1" },
                data: { active: true, countClicks: 0, updateAt: expect.any(Date) },
                select: expect.any(Object)
            });
            expect(mockTx.enterpriseCountDailyClicks.upsert).toHaveBeenCalled();
            expect(redis_1.redis.eval).toHaveBeenCalled();
            expect(result.id).toBe("link1");
        });
        it("não permite ativar link inexistente ou de outra empresa", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValue(null);
            await expect((0, links_service_1.activateLink)("link1", "ent1")).rejects.toMatchObject({
                statusCode: 404,
                message: "Link não encontrado ou não pertence a esta empresa"
            });
        });
        it("não permite ativar link que não esteja no pool de rotação", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1", enterpriseId: "ent1", inRotationPool: false });
            await expect((0, links_service_1.activateLink)("link1", "ent1")).rejects.toMatchObject({
                statusCode: 400,
                message: "Este link não faz parte do pool de rotação e não pode ser ativado manualmente."
            });
        });
        it("garante unicidade lidando com erro P2002 de concorrência", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1", enterpriseId: "ent1", inRotationPool: true });
            const p2002Error = new Error("Unique constraint");
            p2002Error.code = "P2002";
            prisma_1.prisma.$transaction.mockRejectedValue(p2002Error);
            await expect((0, links_service_1.activateLink)("link1", "ent1")).rejects.toMatchObject({
                statusCode: 409,
                message: "Conflito de concorrência: Apenas um link pode estar ativo"
            });
        });
    });
    describe("Reordenação", () => {
        it("altera corretamente a ordem", async () => {
            const payload = { categoryId: "cat1", links: [{ id: "l1", order: 2 }, { id: "l2", order: 1 }] };
            mockTx.enterpriseUrl.count.mockResolvedValue(2);
            mockTx.enterpriseUrl.findMany.mockResolvedValue([{ id: "l1" }, { id: "l2" }]);
            await (0, links_service_1.reorderLinks)("ent1", payload);
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "l1" }, data: { order: 2, updateAt: expect.any(Date) },
                select: expect.any(Object)
            });
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "l2" }, data: { order: 1, updateAt: expect.any(Date) },
                select: expect.any(Object)
            });
        });
        it("altera a ordem inferindo categoria quando categoryId for omitido", async () => {
            const payload = { links: [{ id: "l1", order: 2 }, { id: "l2", order: 1 }] };
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ categoryId: "cat_inferred" });
            mockTx.enterpriseUrl.count.mockResolvedValue(2);
            mockTx.enterpriseUrl.findMany.mockResolvedValue([{ id: "l1" }, { id: "l2" }]);
            await (0, links_service_1.reorderLinks)("ent1", payload);
            expect(mockTx.enterpriseUrl.count).toHaveBeenCalledWith({
                where: { categoryId: "cat_inferred", enterpriseId: "ent1" }
            });
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "l1" }, data: { order: 2, updateAt: expect.any(Date) },
                select: expect.any(Object)
            });
        });
        it("rejeita IDs duplicados", async () => {
            const payload = { categoryId: "cat1", links: [{ id: "l1", order: 1 }, { id: "l1", order: 2 }] };
            await expect((0, links_service_1.reorderLinks)("ent1", payload)).rejects.toMatchObject({
                statusCode: 400,
                message: "O payload não pode conter IDs duplicados"
            });
        });
        it("rejeita orders duplicados", async () => {
            const payload = { categoryId: "cat1", links: [{ id: "l1", order: 1 }, { id: "l2", order: 1 }] };
            await expect((0, links_service_1.reorderLinks)("ent1", payload)).rejects.toMatchObject({
                statusCode: 400,
                message: "O payload não pode conter ordens duplicadas"
            });
        });
        it("rejeita reorder incompleto da categoria", async () => {
            const payload = { categoryId: "cat1", links: [{ id: "l1", order: 1 }] };
            mockTx.enterpriseUrl.count.mockResolvedValue(2); // DB has 2 links
            await expect((0, links_service_1.reorderLinks)("ent1", payload)).rejects.toMatchObject({
                statusCode: 400,
                message: "O payload deve conter a ordenação de todos os links da categoria"
            });
        });
        it("rejeita link de outra empresa (quando não encontrado no findMany)", async () => {
            const payload = { categoryId: "cat1", links: [{ id: "l1", order: 1 }, { id: "l2", order: 2 }] };
            mockTx.enterpriseUrl.count.mockResolvedValue(2);
            mockTx.enterpriseUrl.findMany.mockResolvedValue([{ id: "l1" }]); // Faltou o l2
            await expect((0, links_service_1.reorderLinks)("ent1", payload)).rejects.toMatchObject({
                statusCode: 404,
                message: "Alguns links não foram encontrados, pertencem a outra empresa ou categoria diferente"
            });
        });
        it("rejeita payload inválido pelo Zod", () => {
            const result = links_zod_1.reorderLinksZod.safeParse({ links: [{ id: "not-uuid", order: -1 }] });
            expect(result.success).toBe(false);
        });
    });
    describe("Redirecionamento e Rotação", () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });
        it("deve retornar o link ativo e incrementar no Redis (Fluxo Normal)", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 10 });
            prisma_1.prisma.categoryRotation.findFirst.mockResolvedValue({ toggleType: "MANUAL" });
            redis_1.redis.get.mockResolvedValue("5");
            const url = await (0, links_service_1.processClickAndRedirect)("ent1", "cat1");
            expect(url).toBe("http://link1.com");
        });
        it("deve rotacionar quando LIMITCLICKS for atingido", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 80, order: 1 });
            prisma_1.prisma.categoryRotation.findFirst.mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 100 });
            redis_1.redis.eval.mockResolvedValue(-1);
            redis_1.redis.get.mockResolvedValue("20"); // já atingiu o limite
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1" }); // Double check: ainda é o mesmo
            mockTx.enterpriseUrl.findMany.mockResolvedValue([
                { id: "link1", order: 1 },
                { id: "link2", url: "http://link2.com", order: 2 }
            ]);
            mockTx.enterpriseUrl.update.mockImplementation(({ data }) => {
                if (data.active)
                    return { id: "link2", url: "http://link2.com" }; // return activated link
                return { id: "link1" };
            });
            const url = await (0, links_service_1.processClickAndRedirect)("ent1", "cat1");
            expect(mockTx.$executeRaw).toHaveBeenCalled();
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "link1" },
                data: { active: false, countClicks: 100, updateAt: expect.any(Date) } // consolidado com 100
            });
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "link2" },
                data: { active: true, countClicks: 0, updateAt: expect.any(Date) } // zerado
            });
            expect(url).toBe("http://link2.com");
        });
        it("com limitClicks = 1, primeiro clique (0 registrados) não deve rotacionar, mas deve incrementar", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValue({ id: "linkA", url: "http://linkA.com", countClicks: 0, order: 1 });
            prisma_1.prisma.categoryRotation.findFirst.mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 1 });
            redis_1.redis.eval.mockResolvedValue(1);
            const url = await (0, links_service_1.processClickAndRedirect)("ent1", "cat1");
            // Não rotacionou
            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
            // Pertence ao atual
            expect(url).toBe("http://linkA.com");
        });
        it("com limitClicks = 1, segundo clique (1 registrado) DEVE rotacionar, e clique pertence ao novo", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValue({ id: "linkA", url: "http://linkA.com", countClicks: 0, order: 1 });
            prisma_1.prisma.categoryRotation.findFirst.mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 1 });
            redis_1.redis.eval.mockResolvedValue(-1);
            redis_1.redis.get.mockResolvedValue("1"); // do primeiro clique
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "linkA" });
            mockTx.enterpriseUrl.findMany.mockResolvedValue([
                { id: "linkA", order: 1 },
                { id: "linkB", url: "http://linkB.com", order: 2 }
            ]);
            mockTx.enterpriseUrl.update.mockImplementation(({ data }) => {
                if (data.active)
                    return { id: "linkB", url: "http://linkB.com" };
                return { id: "linkA" };
            });
            const url = await (0, links_service_1.processClickAndRedirect)("ent1", "cat1");
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "linkA" },
                data: { active: false, countClicks: 1, updateAt: expect.any(Date) }
            });
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "linkB" },
                data: { active: true, countClicks: 0, updateAt: expect.any(Date) }
            });
            // O novo clique entra pro link novo
            expect(redis_1.redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
            expect(url).toBe("http://linkB.com");
        });
        it("com limitClicks = 2, segundo clique (1 registrado) não rotaciona", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValue({ id: "linkA", url: "http://linkA.com", countClicks: 0, order: 1 });
            prisma_1.prisma.categoryRotation.findFirst.mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 2 });
            redis_1.redis.eval.mockResolvedValue(2);
            const url = await (0, links_service_1.processClickAndRedirect)("ent1", "cat1");
            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
            expect(url).toBe("http://linkA.com");
        });
        it("com limitClicks = 2, terceiro clique (2 registrados) rotaciona", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValue({ id: "linkA", url: "http://linkA.com", countClicks: 0, order: 1 });
            prisma_1.prisma.categoryRotation.findFirst.mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 2 });
            redis_1.redis.eval.mockResolvedValue(-1);
            redis_1.redis.get.mockResolvedValue("2"); // 2 registrados
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "linkA" });
            mockTx.enterpriseUrl.findMany.mockResolvedValue([
                { id: "linkA", order: 1 },
                { id: "linkB", url: "http://linkB.com", order: 2 }
            ]);
            mockTx.enterpriseUrl.update.mockImplementation(({ data }) => {
                if (data.active)
                    return { id: "linkB", url: "http://linkB.com" };
                return { id: "linkA" };
            });
            const url = await (0, links_service_1.processClickAndRedirect)("ent1", "cat1");
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "linkA" },
                data: { active: false, countClicks: 2, updateAt: expect.any(Date) }
            });
            expect(redis_1.redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
            expect(url).toBe("http://linkB.com");
        });
        it("NÃO deve rotacionar se double-check indicar que o link mudou (concorrência)", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 99, order: 1 });
            prisma_1.prisma.categoryRotation.findFirst.mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 100 });
            redis_1.redis.get.mockResolvedValue("1");
            // Double check: agora o link2 está ativo! Alguém já rotacionou.
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link2", url: "http://link2.com" });
            const url = await (0, links_service_1.processClickAndRedirect)("ent1", "cat1");
            // Não deve ter update
            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
            // E faz apenas incr
            expect(url).toBe("http://link2.com");
        });
        it("deve apenas incrementar no Redis se não houver próximo link elegível", async () => {
            prisma_1.prisma.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 99, order: 1 });
            prisma_1.prisma.categoryRotation.findFirst.mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 100 });
            redis_1.redis.get.mockResolvedValue("0");
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1" });
            mockTx.enterpriseUrl.findMany.mockResolvedValue([
                { id: "link1", order: 1 } // Apenas ele mesmo
            ]);
            const url = await (0, links_service_1.processClickAndRedirect)("ent1", "cat1");
            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled(); // Não alterou nada no BD
            expect(url).toBe("http://link1.com");
        });
    });
});
