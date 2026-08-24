import { activateLink, reorderLinks, createLink, getLinks, getLinkById, updateLink, deleteLink, processClickAndRedirect } from "./links.service";
import { prisma } from "../../shared/database/prisma";
import { redis } from "../../shared/database/redis";
import { AppError } from "../../shared/errors/appError";
import { reorderLinksZod } from "../../shared/zod/links.zod";

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
        }
    }
}));

jest.mock("../../shared/database/redis", () => ({
    redis: {
        get: jest.fn(),
        set: jest.fn(),
        incr: jest.fn()
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
            }
        };

        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
            return await cb(mockTx);
        });

        jest.clearAllMocks();
    });

    describe("CRUD", () => {
        it("deve criar um link e incrementar a ordem", async () => {
            mockTx.enterpriseCategory.findFirst.mockResolvedValue({ id: "cat1", name: "efootball" });
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ order: 5 });
            mockTx.enterpriseUrl.create.mockResolvedValue({ id: "link1", order: 6 });

            const result = await createLink("ent1", { title: "Test", url: "http://test.com" });

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
            (prisma.enterpriseUrl.findMany as jest.Mock).mockResolvedValue([{ id: "link1" }]);
            const result = await getLinks("ent1");
            expect(prisma.enterpriseUrl.findMany).toHaveBeenCalledWith({
                where: { enterpriseId: "ent1", categoryId: undefined },
                select: expect.any(Object),
                orderBy: [{ categoryId: "asc" }, { order: "asc" }]
            });
            expect(result.length).toBe(1);
        });
    });

    describe("Ativação", () => {
        it("deve ativar um link, desativar o atual e resetar countClicks", async () => {
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1", categoryId: "cat1", enterpriseId: "ent1", inRotationPool: true, countClicks: 800 });
            mockTx.enterpriseUrl.updateMany.mockResolvedValue({ count: 1 });
            mockTx.enterpriseUrl.update.mockResolvedValue({ id: "link1", active: true, countClicks: 0 });

            const result = await activateLink("link1", "ent1");

            expect(mockTx.enterpriseUrl.updateMany).toHaveBeenCalledWith({
                where: { categoryId: "cat1", active: true },
                data: { active: false, updateAt: expect.any(Date) }
            });

            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "link1" },
                data: { active: true, countClicks: 0, updateAt: expect.any(Date) },
                select: expect.any(Object)
            });

            expect(result.countClicks).toBe(0);
        });

        it("não permite ativar link inexistente ou de outra empresa", async () => {
            mockTx.enterpriseUrl.findFirst.mockResolvedValue(null);

            await expect(activateLink("link1", "ent1")).rejects.toMatchObject({
                statusCode: 404,
                message: "Link não encontrado ou pertence a outra empresa"
            });
        });

        it("não permite ativar link que não esteja no pool de rotação", async () => {
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1", enterpriseId: "ent1", inRotationPool: false });

            await expect(activateLink("link1", "ent1")).rejects.toMatchObject({
                statusCode: 400,
                message: "O link não está no pool de rotação e não pode ser ativado"
            });
        });

        it("garante unicidade lidando com erro P2002 de concorrência", async () => {
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
        });

        it("deve retornar o link ativo e incrementar no Redis (Fluxo Normal)", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 10 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "MANUAL" });
            (redis.get as jest.Mock).mockResolvedValue("5");

            const url = await processClickAndRedirect("ent1", "cat1");

            expect(redis.get).toHaveBeenCalledWith("clicks:ent1:cat1");
            expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
            expect(url).toBe("http://link1.com");
        });

        it("deve rotacionar quando LIMITCLICKS for atingido", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 80, order: 1 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 100 });
            (redis.get as jest.Mock).mockResolvedValue("19"); // 80 + 19 + 1 = 100

            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1" }); // Double check: ainda é o mesmo
            mockTx.enterpriseUrl.findMany.mockResolvedValue([
                { id: "link1", order: 1 },
                { id: "link2", url: "http://link2.com", order: 2 }
            ]);
            mockTx.enterpriseUrl.update.mockImplementation(({ data }: any) => {
                if (data.active) return { id: "link2", url: "http://link2.com" }; // return activated link
                return { id: "link1" };
            });

            const url = await processClickAndRedirect("ent1", "cat1");

            expect(mockTx.$executeRaw).toHaveBeenCalled();
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "link1" },
                data: { active: false, countClicks: 100, updateAt: expect.any(Date) } // consolidado
            });
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "link2" },
                data: { active: true, countClicks: 0, updateAt: expect.any(Date) } // zerado
            });
            expect(redis.set).toHaveBeenCalledWith("clicks:ent1:cat1", 1);
            expect(url).toBe("http://link2.com");
        });

        it("NÃO deve rotacionar se double-check indicar que o link mudou (concorrência)", async () => {
            (prisma.enterpriseUrl.findFirst as jest.Mock).mockResolvedValue({ id: "link1", url: "http://link1.com", countClicks: 99, order: 1 });
            (prisma.categoryRotation.findFirst as jest.Mock).mockResolvedValue({ toggleType: "LIMITCLICKS", limitClicks: 100 });
            (redis.get as jest.Mock).mockResolvedValue("0"); 

            // Double check: agora o link2 está ativo! Alguém já rotacionou.
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link2", url: "http://link2.com" });

            const url = await processClickAndRedirect("ent1", "cat1");

            // Não deve ter update
            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
            // E faz apenas incr
            expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
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

            const url = await processClickAndRedirect("ent1", "cat1");

            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled(); // Não alterou nada no BD
            expect(redis.incr).toHaveBeenCalledWith("clicks:ent1:cat1");
            expect(url).toBe("http://link1.com");
        });
    });
});
