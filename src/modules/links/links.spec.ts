import { reorderLinks, createLink, getLinks, processClickAndRedirect, activateLink, getEfootballManagerData, simulateEfootballClick } from "./links.service";
import * as linksController from "./links.controller";
import { linksRoutes } from "./links.router";
import { getTodayBRTReferenceDate } from "../../shared/utils/dateUtils";
import { prisma } from "../../shared/database/prisma";
import { redis } from "../../shared/database/redis";
import { reorderLinksZod } from "../../shared/zod/links.zod";

jest.mock("../../shared/database/prisma", () => ({
    prisma: {
        $transaction: jest.fn(),
        $executeRaw: jest.fn(),
        application: {
            findUnique: jest.fn(),
        },
        enterpriseCategory: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
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
            findFirst: jest.fn(),
            upsert: jest.fn()
        },
        urlCountDailyClicks: {
            upsert: jest.fn()
        },
        influencer: {
            findFirst: jest.fn()
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
    let mockTx: any;

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
                findFirst: jest.fn(),
                upsert: jest.fn()
            },
            urlCountDailyClicks: {
                upsert: jest.fn()
            }
        };

        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
            return await cb(mockTx);
        });

        jest.clearAllMocks();
    });

    describe("CRUD", () => {
        it("deve criar um link e incrementar a ordem", async () => {
            const categoryId = "11111111-1111-1111-1111-111111111111";
            mockTx.enterpriseCategory.findFirst.mockResolvedValue({ id: categoryId, name: "efootball", enterpriseId: "ent1" });
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ order: 5 });
            mockTx.enterpriseUrl.create.mockResolvedValue({ id: "link1", order: 6 });

            const result = await createLink("ent1", { title: "Test", url: "http://test.com", categoryId });

            expect(mockTx.enterpriseCategory.findFirst).toHaveBeenCalledWith({
                where: { id: categoryId, enterpriseId: "ent1" }
            });

            expect(mockTx.enterpriseUrl.findFirst).toHaveBeenCalledWith({
                where: { enterpriseId: "ent1", categoryId },
                orderBy: { order: "desc" }
            });

            expect(mockTx.enterpriseUrl.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ order: 6, enterpriseId: "ent1", categoryId, countClicks: 0, active: false }),
                select: expect.any(Object)
            });
            expect(result.order).toBe(6);
        });

        it("deve definir ordem como 1 quando for o primeiro link da categoria", async () => {
            const categoryId = "11111111-1111-1111-1111-111111111111";
            mockTx.enterpriseCategory.findFirst.mockResolvedValue({ id: categoryId, enterpriseId: "ent1" });
            mockTx.enterpriseUrl.findFirst.mockResolvedValue(null);
            mockTx.enterpriseUrl.create.mockResolvedValue({ id: "link1", order: 1 });

            const result = await createLink("ent1", { title: "Test", url: "http://test.com", categoryId });

            expect(mockTx.enterpriseUrl.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ order: 1, enterpriseId: "ent1", categoryId }),
                select: expect.any(Object)
            });
            expect(result.order).toBe(1);
        });

        it("deve lançar erro 404 se a categoria não existir ou pertencer a outra empresa", async () => {
            const categoryId = "11111111-1111-1111-1111-111111111111";
            mockTx.enterpriseCategory.findFirst.mockResolvedValue(null);

            await expect(
                createLink("ent1", { title: "Test", url: "http://test.com", categoryId })
            ).rejects.toMatchObject({
                statusCode: 404,
                message: "Categoria não encontrada ou não pertence a esta empresa"
            });
        });

        it("deve listar links com enterpriseId correto", async () => {
            (prisma.enterpriseUrl.findMany as jest.Mock).mockResolvedValue([{ id: "link1", active: false, countClicks: 0 }]);
            const result = await getLinks("ent1");
            expect(prisma.enterpriseUrl.findMany).toHaveBeenCalledWith({
                where: { enterpriseId: "ent1", categoryId: undefined },
                select: expect.any(Object),
                orderBy: [{ categoryId: "asc" }, { order: "asc" }]
            });
            expect(result.length).toBe(1);
        });

        it("deve somar cliques do Redis somente para o link ativo e não alterar inativos", async () => {
            (prisma.enterpriseUrl.findMany as jest.Mock).mockResolvedValue([
                { id: "linkA", categoryId: "cat1", active: true, countClicks: 10 },
                { id: "linkB", categoryId: "cat1", active: false, countClicks: 25 },
                { id: "linkC", categoryId: "cat1", active: false, countClicks: 8 },
            ]);
            (redis.get as jest.Mock).mockResolvedValue("5");

            const result = await getLinks("ent1", "cat1");

            expect(redis.get).toHaveBeenCalledWith("clicks:ent1:cat1");
            expect(result).toEqual([
                { id: "linkA", categoryId: "cat1", active: true, countClicks: 15 },
                { id: "linkB", categoryId: "cat1", active: false, countClicks: 25 },
                { id: "linkC", categoryId: "cat1", active: false, countClicks: 8 },
            ]);
            // Garante que não realiza alterações no Redis ou banco
            expect(redis.set).not.toHaveBeenCalled();
            expect(redis.incr).not.toHaveBeenCalled();
            expect(prisma.enterpriseUrl.update).not.toHaveBeenCalled();
        });

        it("deve retornar apenas o countClicks do PostgreSQL se link ativo não possuir contador no Redis", async () => {
            (prisma.enterpriseUrl.findMany as jest.Mock).mockResolvedValue([
                { id: "linkA", categoryId: "cat1", active: true, countClicks: 10 }
            ]);
            (redis.get as jest.Mock).mockResolvedValue(null);

            const result = await getLinks("ent1", "cat1");

            expect(result[0].countClicks).toBe(10);
        });

        it("deve isolar contadores de categorias e empresas distintas no Redis", async () => {
            (prisma.enterpriseUrl.findMany as jest.Mock).mockResolvedValue([
                { id: "linkA1", categoryId: "catA", active: true, countClicks: 10 },
                { id: "linkB1", categoryId: "catB", active: true, countClicks: 20 }
            ]);
            (redis.get as jest.Mock).mockImplementation((key: string) => {
                if (key === "clicks:ent1:catA") return Promise.resolve("7");
                if (key === "clicks:ent1:catB") return Promise.resolve("3");
                return Promise.resolve(null);
            });

            const result = await getLinks("ent1");

            expect(redis.get).toHaveBeenCalledWith("clicks:ent1:catA");
            expect(redis.get).toHaveBeenCalledWith("clicks:ent1:catB");
            expect(result[0].countClicks).toBe(17);
            expect(result[1].countClicks).toBe(23);
        });
    });

    describe("Ativação", () => {
        it("deve ativar um link, desativar o atual e resetar countClicks, consolidando redis", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValueOnce({ id: "link1", categoryId: "cat1", enterpriseId: "ent1", inRotationPool: true, countClicks: 800 });
            mockTx.enterpriseUrl.findFirst.mockResolvedValueOnce({ id: "link2", categoryId: "cat1", enterpriseId: "ent1", active: true, countClicks: 100 });

            (redis.get as jest.Mock).mockResolvedValue("50");
            (redis.eval as jest.Mock).mockResolvedValue(1);

            mockTx.enterpriseUrl.update.mockResolvedValue({ id: "link1", active: true, countClicks: 0 });

            const result = await activateLink("link1", "ent1");

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
            expect(redis.eval).toHaveBeenCalled();

            expect(result.id).toBe( "link1");
        });

        it("deve isolar a busca do link ativo apenas para a mesma categoria (findFirst verifica categoryId)", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValueOnce({ id: "linkA", categoryId: "catA", enterpriseId: "ent1", inRotationPool: true });
            mockTx.enterpriseUrl.findFirst.mockResolvedValueOnce(null); // Nenhum ativo na catA
            mockTx.enterpriseUrl.update.mockResolvedValueOnce({ id: "linkA", active: true, countClicks: 0 });

            await activateLink("linkA", "ent1");

            // Valida se o findFirst foi restrito à categoryId correta (catA)
            expect(mockTx.enterpriseUrl.findFirst).toHaveBeenCalledWith({
                where: { enterpriseId: "ent1", categoryId: "catA", active: true }
            });

            // Como retornou nulo (nenhum ativo em catA), não há desativação, apenas a ativação de linkA
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledTimes(1);
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "linkA" },
                data: expect.objectContaining({ active: true }),
                select: expect.any(Object)
            });
        });

        it("não permite ativar link inexistente ou de outra empresa", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(activateLink("link1", "ent1")).rejects.toMatchObject({
                statusCode: 404,
                message: "Link não encontrado ou não pertence a esta empresa"
            });
        });

        it("não permite ativar link que não esteja no pool de rotação", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", enterpriseId: "ent1", inRotationPool: false });

            await expect(activateLink("link1", "ent1")).rejects.toMatchObject({
                statusCode: 400,
                message: "Este link não faz parte do pool de rotação e não pode ser ativado manualmente."
            });
        });

        it("garante unicidade lidando com erro P2002 de concorrência", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", enterpriseId: "ent1", inRotationPool: true });
            const p2002Error = new Error("Unique constraint");
            (p2002Error as any).code = "P2002";
            (prisma.$transaction as jest.Mock).mockRejectedValue(p2002Error);

            await expect(activateLink("link1", "ent1")).rejects.toMatchObject({
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

            await reorderLinks("ent1", payload);

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

            await reorderLinks("ent1", payload);

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
            await expect(reorderLinks("ent1", payload)).rejects.toMatchObject({
                statusCode: 400,
                message: "O payload não pode conter IDs duplicados"
            });
        });

        it("rejeita orders duplicados", async () => {
            const payload = { categoryId: "cat1", links: [{ id: "l1", order: 1 }, { id: "l2", order: 1 }] };
            await expect(reorderLinks("ent1", payload)).rejects.toMatchObject({
                statusCode: 400,
                message: "O payload não pode conter ordens duplicadas"
            });
        });

        it("rejeita reorder incompleto da categoria", async () => {
            const payload = { categoryId: "cat1", links: [{ id: "l1", order: 1 }] };
            mockTx.enterpriseUrl.count.mockResolvedValue(2); // DB has 2 links

            await expect(reorderLinks("ent1", payload)).rejects.toMatchObject({
                statusCode: 400,
                message: "O payload deve conter a ordenação de todos os links da categoria"
            });
        });

        it("rejeita link de outra empresa (quando não encontrado no findMany)", async () => {
            const payload = { categoryId: "cat1", links: [{ id: "l1", order: 1 }, { id: "l2", order: 2 }] };
            mockTx.enterpriseUrl.count.mockResolvedValue(2);
            mockTx.enterpriseUrl.findMany.mockResolvedValue([{ id: "l1" }]); // Faltou o l2

            await expect(reorderLinks("ent1", payload)).rejects.toMatchObject({
                statusCode: 404,
                message: "Alguns links não foram encontrados, pertencem a outra empresa ou categoria diferente"
            });
        });

        it("rejeita payload inválido pelo Zod", () => {
            const result = reorderLinksZod.safeParse({ links: [{ id: "not-uuid", order: -1 }] });
            expect(result.success).toBe(false);
        });
    });

    describe("Redirecionamento e Rotação", () => {
        beforeEach(() => {
            jest.clearAllMocks();
            (prisma.application.findUnique as jest.Mock).mockResolvedValue({ id: "app1" });
            (prisma.enterpriseCategory.findUnique as jest.Mock).mockResolvedValue({ id: "cat1", enterpriseId: "ent1" });
            // Por padrão, SET NX retorna "OK" (visitante inédito)
            (redis.set as jest.Mock).mockResolvedValue("OK");
        });

        it("deve retornar o link ativo e incrementar no Redis (Fluxo Normal)", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 10 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "MANUAL" });
            (redis.get as jest.Mock).mockResolvedValue("5");

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} } });

            expect(url).toBe("http://link1.com");
        });

        it("deve rotacionar quando LIMITCLICKS for atingido", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 80, order: 1 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 100 });
            (redis.eval as jest.Mock).mockResolvedValue(-1); (redis.get as jest.Mock).mockResolvedValue("20"); // já atingiu o limite

            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1" }); // Double check: ainda é o mesmo
            mockTx.enterpriseUrl.findMany.mockResolvedValue([
                { id: "link1", order: 1 },
                { id: "link2", url: "http://link2.com", order: 2 }
            ]);
            mockTx.enterpriseUrl.update.mockImplementation(({ data }: any) => {
                if (data.active) return { id: "link2", url: "http://link2.com" }; // return activated link
                return { id: "link1" };
            });

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} } });

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
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "linkA", url: "http://linkA.com", countClicks: 0, order: 1 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 1 });
            (redis.eval as jest.Mock).mockResolvedValue(1);

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} } });

            // Não rotacionou
            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
            // Pertence ao atual
            expect(url).toBe("http://linkA.com");
        });

        it("com limitClicks = 1, segundo clique (1 registrado) DEVE rotacionar, e clique pertence ao novo", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "linkA", url: "http://linkA.com", countClicks: 0, order: 1 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 1 });
            (redis.eval as jest.Mock).mockResolvedValue(-1); (redis.get as jest.Mock).mockResolvedValue("1"); // do primeiro clique

            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "linkA" });
            mockTx.enterpriseUrl.findMany.mockResolvedValue([
                { id: "linkA", order: 1 },
                { id: "linkB", url: "http://linkB.com", order: 2 }
            ]);
            mockTx.enterpriseUrl.update.mockImplementation(({ data }: any) => {
                if (data.active) return { id: "linkB", url: "http://linkB.com" };
                return { id: "linkA" };
            });

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} } });

            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "linkA" },
                data: { active: false, countClicks: 1, updateAt: expect.any(Date) }
            });
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "linkB" },
                data: { active: true, countClicks: 0, updateAt: expect.any(Date) }
            });
            // O novo clique entra pro link novo
            expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
            expect(url).toBe("http://linkB.com");
        });

        it("com limitClicks = 2, segundo clique (1 registrado) não rotaciona", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "linkA", url: "http://linkA.com", countClicks: 0, order: 1 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 2 });
            (redis.eval as jest.Mock).mockResolvedValue(2);

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} } });

            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
            expect(url).toBe("http://linkA.com");
        });

        it("com limitClicks = 2, terceiro clique (2 registrados) rotaciona", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "linkA", url: "http://linkA.com", countClicks: 0, order: 1 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 2 });
            (redis.eval as jest.Mock).mockResolvedValue(-1); (redis.get as jest.Mock).mockResolvedValue("2"); // 2 registrados

            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "linkA" });
            mockTx.enterpriseUrl.findMany.mockResolvedValue([
                { id: "linkA", order: 1 },
                { id: "linkB", url: "http://linkB.com", order: 2 }
            ]);
            mockTx.enterpriseUrl.update.mockImplementation(({ data }: any) => {
                if (data.active) return { id: "linkB", url: "http://linkB.com" };
                return { id: "linkA" };
            });

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} } });

            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "linkA" },
                data: { active: false, countClicks: 2, updateAt: expect.any(Date) }
            });
            expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
            expect(url).toBe("http://linkB.com");
        });

        it("NÃO deve rotacionar se double-check indicar que o link mudou (concorrência)", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 99, order: 1 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 100 });
            (redis.get as jest.Mock).mockResolvedValue("1");

            // Double check: agora o link2 está ativo! Alguém já rotacionou.
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link2", url: "http://link2.com" });

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} } });

            // Não deve ter update
            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
            // E faz apenas incr
            expect(url).toBe("http://link2.com");
        });

        it("deve apenas incrementar no Redis se não houver próximo link elegível", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 99, order: 1 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 100 });
            (redis.get as jest.Mock).mockResolvedValue("0");

            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1" });
            mockTx.enterpriseUrl.findMany.mockResolvedValue([
                { id: "link1", order: 1 } // Apenas ele mesmo
            ]);

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} } });

            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled(); // Não alterou nada no BD
            expect(url).toBe("http://link1.com");
        });

        it("deve incrementar chave de influencer no Redis se influencerSlug válido for passado", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 10 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "MANUAL" });
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue({ id: "inf1", slug: "valido", enterpriseId: "ent1" });

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} }, influencerSlug: "valido" });

            expect(prisma.influencer.findFirst).toHaveBeenCalledWith({
                where: { slug: "valido", enterpriseId: "ent1" }
            });
            expect(redis.incr).toHaveBeenCalledWith("influencer_clicks:ent1:inf1");
            expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1"); // Mantém o incremento da categoria
            expect(url).toBe("http://link1.com");
        });

        it("NÃO deve incrementar chave de influencer se influencerSlug for inválido (e não deve quebrar o fluxo)", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 10 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "MANUAL" });
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue(null);

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} }, influencerSlug: "invalido" });

            expect(prisma.influencer.findFirst).toHaveBeenCalledWith({
                where: { slug: "invalido", enterpriseId: "ent1" }
            });
            // O incremento da categoria ocorre
            expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
            // Mas não incrementa nada de influenciador e o fluxo segue normal
            expect(url).toBe("http://link1.com");
        });

        it("NÃO deve falhar o redirect se o Redis do influencer falhar (falha silenciosa para o influencer)", async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 10 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "MANUAL" });
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue({ id: "inf1", slug: "valido", enterpriseId: "ent1" });

            // Simula uma falha apenas no primeiro incr (que será o do influenciador)
            (redis.incr as jest.Mock)
                .mockRejectedValueOnce(new Error("Redis connection lost"))
                .mockResolvedValueOnce(1);

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} }, influencerSlug: "valido" });

            expect(prisma.influencer.findFirst).toHaveBeenCalledWith({
                where: { slug: "valido", enterpriseId: "ent1" }
            });
            // O erro foi logado
            expect(consoleSpy).toHaveBeenCalled();

            // O incremento da categoria ocorre normalmente (o segundo incr)
            expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
            // O redirect funciona
            expect(url).toBe("http://link1.com");

            consoleSpy.mockRestore();
        });

        it("NÃO deve atribuir clique se o influenciador pertencer a outra empresa (cross-tenant)", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 10 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "MANUAL" });

            // Simula a situação onde a categoria é da ent1, mas mandaram um slug da ent2.
            // O `findFirst` vai procurar pelo slug na ent1 e NÃO vai encontrar.
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue(null);

            const { url } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "test-visitor-id", categories: {} }, influencerSlug: "slug-da-ent2" });

            expect(prisma.influencer.findFirst).toHaveBeenCalledWith({
                // Verifica a regra de negócio: procura o influenciador no Enterprise da Categoria
                where: { slug: "slug-da-ent2", enterpriseId: "ent1" }
            });

            // Como retornou null, não incrementa influencer e segue normal para categoria
            expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
            expect(url).toBe("http://link1.com");
        });

        // ─── Testes de Deduplicação de Cliques ────────────────────────────────
        describe("Deduplicação de Cliques por Visitante", () => {
            it("VISITANTE INÉDITO: deve contabilizar clique e retornar payload com categoria atualizada", async () => {
                (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 5 });
                (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "MANUAL" });

                const { url, updatedVisitorPayload } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload: { id: "new-visitor", categories: {} } });

                expect(redis.set).not.toHaveBeenCalled();
                expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
                expect(url).toBe("http://link1.com");
                expect(updatedVisitorPayload).toBeDefined();
                expect(updatedVisitorPayload!.categories["cat1"]).toBeDefined();
            });

            it("VISITANTE REPETIDO: NÃO deve contabilizar clique e NÃO deve alterar payload se já houver registro recente", async () => {
                (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 5 });
                
                const now = Date.now();
                const visitorPayload = { id: "existing-visitor", categories: { "cat1": now - 1000 } }; // Clicou há 1 segundo
                const { url, updatedVisitorPayload } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload });

                expect(redis.set).not.toHaveBeenCalled();
                // Não deve ter chamado redis.incr (nenhuma contagem)
                expect(redis.incr).not.toHaveBeenCalled();
                // Não deve ter alterado o payload
                expect(updatedVisitorPayload).toBeUndefined();
                // Retorna a URL ativa
                expect(url).toBe("http://link1.com");
            });

            it("VISITANTE REPETIDO EM OUTRA CATEGORIA: deve contabilizar e adicionar nova categoria no payload", async () => {
                (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 5 });
                
                const now = Date.now();
                const visitorPayload = { id: "existing-visitor", categories: { "cat1": now - 1000 } }; 
                const { url, updatedVisitorPayload } = await processClickAndRedirect("cat2", { shouldCountClick: true, visitorPayload });

                expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat2");
                expect(updatedVisitorPayload).toBeDefined();
                expect(updatedVisitorPayload!.categories["cat1"]).toBeDefined();
                expect(updatedVisitorPayload!.categories["cat2"]).toBeDefined();
                expect(url).toBe("http://link1.com");
            });

            it("VISITANTE COM CATEGORIA EXPIRADA: deve contabilizar novamente se passar de 30 dias", async () => {
                (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 5 });
                
                const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
                const now = Date.now();
                const visitorPayload = { id: "existing-visitor", categories: { "cat1": now - thirtyOneDaysMs } }; 
                const { url, updatedVisitorPayload } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload });

                expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
                expect(updatedVisitorPayload).toBeDefined();
                expect(updatedVisitorPayload!.categories["cat1"]).toBeGreaterThan(now - thirtyOneDaysMs);
                expect(url).toBe("http://link1.com");
            });

            
            it("LIMPEZA PASSIVA: deve retornar payload atualizado se houver limpeza, mesmo sem novo clique", async () => {
                (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 5 });
                const now = Date.now();
                // cat1 foi clicada há 1 seg (válida, deduplicada), mas cat2 foi clicada há 31 dias (deve ser limpa)
                const visitorPayload = { id: "existing-visitor", categories: { "cat1": now - 1000, "cat2": now - (31 * 24 * 60 * 60 * 1000) } }; 
                const { url, updatedVisitorPayload } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload });

                expect(redis.incr).not.toHaveBeenCalled(); // Não contou clique
                expect(updatedVisitorPayload).toBeDefined(); // Mas atualizou o payload!
                expect(updatedVisitorPayload!.categories["cat1"]).toBeDefined();
                expect(updatedVisitorPayload!.categories["cat2"]).toBeUndefined(); // cat2 foi deletada passivamente
                expect(url).toBe("http://link1.com");
            });

            it("LIMITE DE 20 CATEGORIAS: deve remover a mais antiga ao exceder o limite", async () => {
                (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 5 });
                const now = Date.now();
                const categories: Record<string, number> = {};
                for (let i = 1; i <= 20; i++) {
                    categories["cat" + i] = now - (i * 1000); // cat20 é a mais velha (20s atrás), cat1 a mais nova
                }
                const visitorPayload = { id: "existing-visitor", categories }; 
                const { url, updatedVisitorPayload } = await processClickAndRedirect("catNEW", { shouldCountClick: true, visitorPayload });

                expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:catNEW");
                expect(updatedVisitorPayload).toBeDefined();
                expect(Object.keys(updatedVisitorPayload!.categories).length).toBe(20);
                expect(updatedVisitorPayload!.categories["catNEW"]).toBeDefined();
                expect(updatedVisitorPayload!.categories["cat20"]).toBeUndefined(); // A mais velha removida
                expect(url).toBe("http://link1.com");
            });

            it("TIMESTAMPS FUTUROS: deve descartar timestamps inválidos", async () => {
                (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 5 });
                const now = Date.now();
                // cat1 com timestamp no futuro (fraudulento)
                const visitorPayload = { id: "existing-visitor", categories: { "cat1": now + 100000 } }; 
                const { url, updatedVisitorPayload } = await processClickAndRedirect("cat1", { shouldCountClick: true, visitorPayload });

                // Como foi descartada, o clique DEVE ser contabilizado
                expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
                expect(updatedVisitorPayload).toBeDefined();
                expect(updatedVisitorPayload!.categories["cat1"]).toBeGreaterThanOrEqual(now);
                expect(url).toBe("http://link1.com");
            });

            it("USUÁRIO AUTENTICADO: NÃO deve contabilizar e NÃO deve alterar payload (shouldCountClick=false)", async () => {
                (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 99 });
                (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 100 });

                const { url, updatedVisitorPayload } = await processClickAndRedirect("cat1", { shouldCountClick: false });

                expect(redis.set).not.toHaveBeenCalled();
                expect(redis.incr).not.toHaveBeenCalled();
                expect(updatedVisitorPayload).toBeUndefined();
                expect(url).toBe("http://link1.com");
            });
        });
    });

    describe("Painel de Gerenciamento Exclusivo do Alecio (efootball)", () => {
        const enterpriseId = "ent-alecio-1";
        const efootballCategoryId = "cat-efootball-1";

        beforeEach(() => {
            jest.clearAllMocks();
        });

        it("deve retornar corretamente os links da categoria efootball, o link ativo e os cards de status", async () => {
            const today = getTodayBRTReferenceDate();
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue({
                id: efootballCategoryId,
                name: "efootball",
                enterpriseId,
            });
            (prisma.enterpriseUrl.findMany as jest.Mock).mockResolvedValue([
                {
                    id: "link-1",
                    title: "Grupo 1",
                    url: "https://grupo1.com",
                    countClicks: 40,
                    active: true,
                    order: 1,
                    inRotationPool: true,
                    categoryId: efootballCategoryId,
                },
                {
                    id: "link-2",
                    title: "Grupo 2",
                    url: "https://grupo2.com",
                    countClicks: 10,
                    active: false,
                    order: 2,
                    inRotationPool: true,
                    categoryId: efootballCategoryId,
                },
            ]);
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({
                categoryId: efootballCategoryId,
                toggleType: "LIMITCLICKS",
                limitClicks: 100,
            });
            (prisma.enterpriseCountDailyClicks.findFirst as jest.Mock).mockResolvedValue({
                enterpriseId,
                referenceDate: today,
                dailyClicks: 20,
            });
            (redis.get as jest.Mock).mockResolvedValue("5");

            const result = await getEfootballManagerData(enterpriseId);

            expect(prisma.enterpriseCategory.findFirst).toHaveBeenCalledWith({
                where: { name: "efootball", enterpriseId },
            });
            expect(prisma.enterpriseUrl.findMany).toHaveBeenCalledWith({
                where: { enterpriseId, categoryId: efootballCategoryId },
                select: expect.any(Object),
                orderBy: [{ categoryId: "asc" }, { order: "asc" }],
            });
            expect(prisma.enterpriseCountDailyClicks.findFirst).toHaveBeenCalledWith({
                where: { enterpriseId, referenceDate: today },
            });
            expect(prisma.categoryRotation.findFirst).toHaveBeenCalledWith({
                where: { categoryId: efootballCategoryId },
            });

            expect(result).toEqual({
                categoryId: efootballCategoryId,
                links: [
                    {
                        id: "link-1",
                        title: "Grupo 1",
                        url: "https://grupo1.com",
                        countClicks: 45,
                        active: true,
                        order: 1,
                        inRotationPool: true,
                        categoryId: efootballCategoryId,
                    },
                    {
                        id: "link-2",
                        title: "Grupo 2",
                        url: "https://grupo2.com",
                        countClicks: 10,
                        active: false,
                        order: 2,
                        inRotationPool: true,
                        categoryId: efootballCategoryId,
                    },
                ],
                activeLink: {
                    id: "link-1",
                    title: "Grupo 1",
                    url: "https://grupo1.com",
                    countClicks: 45,
                    active: true,
                    order: 1,
                    inRotationPool: true,
                    categoryId: efootballCategoryId,
                },
                status: {
                    totalLinks: 2,
                    dailyClicks: 25,
                    rotationLimit: 100,
                    activeLink: "Grupo 1",
                },
            });
        });

        it("deve tratar adequadamente empresa sem links cadastrados, retornando mesmo assim o categoryId", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue({
                id: efootballCategoryId,
                name: "efootball",
                enterpriseId,
            });
            (prisma.enterpriseUrl.findMany as jest.Mock).mockResolvedValue([]);
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({
                categoryId: efootballCategoryId,
                toggleType: "LIMITCLICKS",
                limitClicks: 50,
            });
            (prisma.enterpriseCountDailyClicks.findFirst as jest.Mock).mockResolvedValue(null);
            (redis.get as jest.Mock).mockResolvedValue(null);

            const result = await getEfootballManagerData(enterpriseId);

            expect(result).toEqual({
                categoryId: efootballCategoryId,
                links: [],
                activeLink: null,
                status: {
                    totalLinks: 0,
                    dailyClicks: 0,
                    rotationLimit: 50,
                    activeLink: null,
                },
            });
        });

        it("deve tratar adequadamente empresa sem link ativo", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue({
                id: efootballCategoryId,
                name: "efootball",
                enterpriseId,
            });
            (prisma.enterpriseUrl.findMany as jest.Mock).mockResolvedValue([
                {
                    id: "link-1",
                    title: "Grupo 1",
                    url: "https://grupo1.com",
                    countClicks: 12,
                    active: false,
                    order: 1,
                    inRotationPool: true,
                    categoryId: efootballCategoryId,
                },
            ]);
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({
                categoryId: efootballCategoryId,
                toggleType: "MANUAL",
                limitClicks: null,
            });
            (prisma.enterpriseCountDailyClicks.findFirst as jest.Mock).mockResolvedValue({
                dailyClicks: 12,
            });
            (redis.get as jest.Mock).mockResolvedValue(null);

            const result = await getEfootballManagerData(enterpriseId);

            expect(result.activeLink).toBeNull();
            expect(result.status).toEqual({
                totalLinks: 1,
                dailyClicks: 12,
                rotationLimit: 0,
                activeLink: null,
            });
        });

        it("deve retornar rotationLimit como 0 quando não houver configuração de rotação", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue({
                id: efootballCategoryId,
                name: "efootball",
                enterpriseId,
            });
            (prisma.enterpriseUrl.findMany as jest.Mock).mockResolvedValue([]);
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue(null);
            (prisma.enterpriseCountDailyClicks.findFirst as jest.Mock).mockResolvedValue(null);
            (redis.get as jest.Mock).mockResolvedValue(null);

            const result = await getEfootballManagerData(enterpriseId);

            expect(result.status.rotationLimit).toBe(0);
        });

        it("deve garantir isolamento entre empresas diferentes e lançar 404 se a categoria efootball não existir para a empresa", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(getEfootballManagerData("outra-empresa-id")).rejects.toMatchObject({
                statusCode: 404,
                message: "Categoria efootball não encontrada para esta empresa.",
            });

            expect(prisma.enterpriseCategory.findFirst).toHaveBeenCalledWith({
                where: { name: "efootball", enterpriseId: "outra-empresa-id" },
            });
            expect(prisma.enterpriseUrl.findMany).not.toHaveBeenCalled();
        });

        it("controller getEfootballManagerAlecio deve usar o enterpriseId do usuário autenticado e retornar status 200", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue({
                id: efootballCategoryId,
                name: "efootball",
                enterpriseId,
            });
            (prisma.enterpriseUrl.findMany as jest.Mock).mockResolvedValue([]);
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue(null);
            (prisma.enterpriseCountDailyClicks.findFirst as jest.Mock).mockResolvedValue(null);
            (redis.get as jest.Mock).mockResolvedValue(null);

            const req: any = { user: { id: "user-1", enterpriseId } };
            const res: any = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn().mockReturnThis(),
            };
            const next = jest.fn();

            await linksController.getEfootballManagerAlecio(req, res, next);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                categoryId: efootballCategoryId,
                links: [],
                activeLink: null,
                status: {
                    totalLinks: 0,
                    dailyClicks: 0,
                    rotationLimit: 0,
                    activeLink: null,
                },
            });
            expect(next).not.toHaveBeenCalled();
        });

        it("controller getEfootballManagerAlecio deve repassar erro para next caso ocorra falha", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue(null);

            const req: any = { user: { id: "user-1", enterpriseId } };
            const res: any = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn().mockReturnThis(),
            };
            const next = jest.fn();

            await linksController.getEfootballManagerAlecio(req, res, next);

            expect(next).toHaveBeenCalledWith(
                expect.objectContaining({
                    statusCode: 404,
                    message: "Categoria efootball não encontrada para esta empresa.",
                })
            );
        });

        it("rota GET /efootball/alecio deve estar registrada no router antes de /:id", () => {
            const stack = (linksRoutes as any).stack;
            const efootballIndex = stack.findIndex(
                (layer: any) => layer.route?.path === "/efootball/alecio" && layer.route?.methods?.get
            );
            const getByIdIndex = stack.findIndex(
                (layer: any) => layer.route?.path === "/:id" && layer.route?.methods?.get
            );

            expect(efootballIndex).toBeGreaterThan(-1);
            expect(efootballIndex).toBeLessThan(getByIdIndex);
        });

        describe("Simulação de Clique (change-next-group)", () => {
            it("deve incrementar clique no Redis sem atualizar PostgreSQL quando limite não foi atingido", async () => {
                (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue({
                    id: efootballCategoryId,
                    name: "efootball",
                    enterpriseId,
                });
                (prisma.enterpriseCategory.findUnique as jest.Mock).mockResolvedValue({
                    id: efootballCategoryId,
                    name: "efootball",
                    enterpriseId,
                });
                (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({
                    id: "link-1",
                    url: "https://grupo1.com",
                    countClicks: 10,
                    order: 1,
                });
                (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({
                    categoryId: efootballCategoryId,
                    toggleType: "LIMITCLICKS",
                    limitClicks: 100,
                });
                (redis.eval as jest.Mock).mockResolvedValue(1);

                const result = await simulateEfootballClick(enterpriseId);

                expect(prisma.enterpriseCategory.findFirst).toHaveBeenCalledWith({
                    where: { name: "efootball", enterpriseId },
                });
                expect(redis.eval).toHaveBeenCalledWith(
                    expect.any(String),
                    1,
                    `clicks:${enterpriseId}:${efootballCategoryId}`,
                    10,
                    100
                );
                expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
                expect(result).toEqual({ status: 200, url: "https://grupo1.com" });
            });

            it("deve rotacionar para o próximo link quando LIMITCLICKS for atingido na simulação", async () => {
                (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue({
                    id: efootballCategoryId,
                    name: "efootball",
                    enterpriseId,
                });
                (prisma.enterpriseCategory.findUnique as jest.Mock).mockResolvedValue({
                    id: efootballCategoryId,
                    name: "efootball",
                    enterpriseId,
                });
                (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({
                    id: "link-1",
                    url: "https://grupo1.com",
                    countClicks: 80,
                    order: 1,
                });
                (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({
                    categoryId: efootballCategoryId,
                    toggleType: "LIMITCLICKS",
                    limitClicks: 100,
                });
                (redis.eval as jest.Mock).mockResolvedValue(-1);
                (redis.get as jest.Mock).mockResolvedValue("20");

                mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link-1" });
                mockTx.enterpriseUrl.findMany.mockResolvedValue([
                    { id: "link-1", order: 1 },
                    { id: "link-2", url: "https://grupo2.com", order: 2 },
                ]);
                mockTx.enterpriseUrl.update.mockImplementation(({ data }: any) => {
                    if (data.active) return { id: "link-2", url: "https://grupo2.com" };
                    return { id: "link-1" };
                });

                const result = await simulateEfootballClick(enterpriseId);

                expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                    where: { id: "link-1" },
                    data: { active: false, countClicks: 100, updateAt: expect.any(Date) },
                });
                expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                    where: { id: "link-2" },
                    data: { active: true, countClicks: 0, updateAt: expect.any(Date) },
                });
                expect(redis.incr).toHaveBeenCalledWith(`clicks:${enterpriseId}:${efootballCategoryId}`);
                expect(result).toEqual({ status: 200, url: "https://grupo2.com" });
            });

            it("deve lançar 404 se a categoria efootball não existir para a empresa na simulação", async () => {
                (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue(null);

                await expect(simulateEfootballClick("outra-empresa")).rejects.toMatchObject({
                    statusCode: 404,
                    message: "Categoria efootball não encontrada para esta empresa.",
                });
            });

            it("controller changeNextGroup deve responder status 200 com JSON sem redirecionar o navegador", async () => {
                (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue({
                    id: efootballCategoryId,
                    name: "efootball",
                    enterpriseId,
                });
                (prisma.enterpriseCategory.findUnique as jest.Mock).mockResolvedValue({
                    id: efootballCategoryId,
                    name: "efootball",
                    enterpriseId,
                });
                (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({
                    id: "link-1",
                    url: "https://grupo1.com",
                    countClicks: 5,
                    order: 1,
                });
                (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({
                    categoryId: efootballCategoryId,
                    toggleType: "MANUAL",
                });

                const req: any = { user: { id: "user-1", enterpriseId } };
                const res: any = {
                    status: jest.fn().mockReturnThis(),
                    json: jest.fn().mockReturnThis(),
                    redirect: jest.fn(),
                };
                const next = jest.fn();

                await linksController.changeNextGroup(req, res, next);

                expect(res.redirect).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.json).toHaveBeenCalledWith({ status: 200, url: "https://grupo1.com" });
            });

            it("rota PUT /change-next-group deve estar registrada no router antes de /:id", () => {
                const stack = (linksRoutes as any).stack;
                const changeNextIndex = stack.findIndex(
                    (layer: any) => layer.route?.path === "/change-next-group" && layer.route?.methods?.put
                );
                const getByIdIndex = stack.findIndex(
                    (layer: any) => layer.route?.path === "/:id" && layer.route?.methods?.get
                );

                expect(changeNextIndex).toBeGreaterThan(-1);
                expect(changeNextIndex).toBeLessThan(getByIdIndex);
            });
        });
    });
});
