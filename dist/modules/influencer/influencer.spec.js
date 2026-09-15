"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const influencer_service_1 = require("./influencer.service");
const prisma_1 = require("../../shared/database/prisma");
const influencer_zod_1 = require("../../shared/zod/influencer.zod");
jest.mock("../../shared/database/prisma", () => ({
    prisma: {
        influencer: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        }
    }
}));
describe("Influencer Module", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe("CRUD & Validation", () => {
        it("1. deve criar influenciador com sucesso (counterEntries = 0)", async () => {
            const mockInfluencer = { id: "inf1", name: "Fulano", slug: "fulano", counterEntries: 0 };
            prisma_1.prisma.influencer.create.mockResolvedValue(mockInfluencer);
            const result = await (0, influencer_service_1.createInfluencer)("ent1", {
                name: "Fulano",
                slug: "fulano",
                personalUrl: "https://example.com"
            });
            expect(prisma_1.prisma.influencer.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    name: "Fulano",
                    slug: "fulano",
                    personalUrl: "https://example.com",
                    counterEntries: 0,
                    enterpriseId: "ent1"
                })
            });
            expect(result).toEqual(mockInfluencer);
        });
        it("2. deve impedir criação de influenciador com campos inválidos", () => {
            const result1 = influencer_zod_1.createInfluencerZod.safeParse({
                name: "",
                slug: "fulano",
                personalUrl: "https://example.com"
            });
            expect(result1.success).toBe(false);
            const result2 = influencer_zod_1.createInfluencerZod.safeParse({
                name: "Fulano",
                slug: "inválido!",
                personalUrl: "https://example.com"
            });
            expect(result2.success).toBe(false);
            const result3 = influencer_zod_1.createInfluencerZod.safeParse({
                name: "Fulano",
                slug: "fulano",
                personalUrl: "invalid-url"
            });
            expect(result3.success).toBe(false);
            // Não aceita password
            const result4 = influencer_zod_1.createInfluencerZod.safeParse({
                name: "Fulano",
                slug: "fulano",
                personalUrl: "https://example.com",
                password: "123"
            });
            expect(result4.success).toBe(false);
        });
        it("3. deve retornar erro 409 se violar unicidade de slug/email/url no mesmo enterprise", async () => {
            const p2002Error = new Error("Unique constraint");
            p2002Error.code = "P2002";
            p2002Error.meta = { target: ["slug", "enterprise_id"] };
            prisma_1.prisma.influencer.create.mockRejectedValue(p2002Error);
            await expect((0, influencer_service_1.createInfluencer)("ent1", {
                name: "Fulano",
                slug: "fulano",
                personalUrl: "https://example.com"
            })).rejects.toMatchObject({
                statusCode: 409,
                message: "Já existe um influenciador com este slug nesta empresa."
            });
        });
        it("4. deve listar influenciadores limitados ao tenant (enterpriseId)", async () => {
            prisma_1.prisma.influencer.findMany.mockResolvedValue([{ id: "inf1" }]);
            const result = await (0, influencer_service_1.getInfluencers)("ent1");
            expect(prisma_1.prisma.influencer.findMany).toHaveBeenCalledWith({
                where: { enterpriseId: "ent1" },
                orderBy: { createAt: 'desc' }
            });
            expect(result.length).toBe(1);
        });
        it("5. deve buscar um influenciador pelo ID confirmando enterpriseId", async () => {
            prisma_1.prisma.influencer.findFirst.mockResolvedValue({ id: "inf1" });
            const result = await (0, influencer_service_1.getInfluencerById)("inf1", "ent1");
            expect(prisma_1.prisma.influencer.findFirst).toHaveBeenCalledWith({
                where: { id: "inf1", enterpriseId: "ent1" }
            });
            expect(result?.id).toBe("inf1");
        });
        it("6. deve impedir de buscar influenciador de outro tenant e retornar 404", async () => {
            prisma_1.prisma.influencer.findFirst.mockResolvedValue(null);
            await expect((0, influencer_service_1.getInfluencerById)("inf2", "ent1")).rejects.toMatchObject({
                statusCode: 404,
                message: "Influenciador não encontrado ou acesso negado"
            });
        });
        it("7. deve atualizar influenciador com sucesso (valida acesso ao tenant)", async () => {
            prisma_1.prisma.influencer.findFirst.mockResolvedValue({ id: "inf1" });
            prisma_1.prisma.influencer.update.mockResolvedValue({ id: "inf1", name: "Ciclano" });
            const result = await (0, influencer_service_1.updateInfluencer)("inf1", "ent1", { name: "Ciclano" });
            expect(prisma_1.prisma.influencer.update).toHaveBeenCalledWith({
                where: { id: "inf1" },
                data: expect.objectContaining({
                    name: "Ciclano"
                })
            });
            expect(result?.name).toBe("Ciclano");
        });
        it("8. deve impedir atualização de influenciador de outro tenant e retornar 404", async () => {
            prisma_1.prisma.influencer.findFirst.mockResolvedValue(null); // findById falha
            await expect((0, influencer_service_1.updateInfluencer)("inf1", "ent2", { name: "Novo" })).rejects.toMatchObject({
                statusCode: 404,
                message: "Influenciador não encontrado ou acesso negado"
            });
            expect(prisma_1.prisma.influencer.update).not.toHaveBeenCalled();
        });
        it("9. deve remover influenciador com sucesso (valida acesso ao tenant)", async () => {
            prisma_1.prisma.influencer.findFirst.mockResolvedValue({ id: "inf1" });
            await (0, influencer_service_1.deleteInfluencer)("inf1", "ent1");
            expect(prisma_1.prisma.influencer.delete).toHaveBeenCalledWith({
                where: { id: "inf1" }
            });
        });
        it("10. deve impedir exclusão de influenciador de outro tenant e retornar 404", async () => {
            prisma_1.prisma.influencer.findFirst.mockResolvedValue(null); // findById falha
            await expect((0, influencer_service_1.deleteInfluencer)("inf1", "ent2")).rejects.toMatchObject({
                statusCode: 404,
                message: "Influenciador não encontrado ou acesso negado"
            });
            expect(prisma_1.prisma.influencer.delete).not.toHaveBeenCalled();
        });
    });
});
