import { createInfluencer, getInfluencers, getInfluencerById, updateInfluencer, deleteInfluencer } from "./influencer.service";
import { prisma } from "../../shared/database/prisma";
import { createInfluencerZod, updateInfluencerZod } from "../../shared/zod/influencer.zod";

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
            (prisma.influencer.create as jest.Mock).mockResolvedValue(mockInfluencer);

            const result = await createInfluencer("ent1", {
                name: "Fulano",
                slug: "fulano",
                personalUrl: "https://example.com"
            });

            expect(prisma.influencer.create).toHaveBeenCalledWith({
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
            const result1 = createInfluencerZod.safeParse({
                name: "",
                slug: "fulano",
                personalUrl: "https://example.com"
            });
            expect(result1.success).toBe(false);

            const result2 = createInfluencerZod.safeParse({
                name: "Fulano",
                slug: "inválido!",
                personalUrl: "https://example.com"
            });
            expect(result2.success).toBe(false);

            const result3 = createInfluencerZod.safeParse({
                name: "Fulano",
                slug: "fulano",
                personalUrl: "invalid-url"
            });
            expect(result3.success).toBe(false);

            // Não aceita password
            const result4 = createInfluencerZod.safeParse({
                name: "Fulano",
                slug: "fulano",
                personalUrl: "https://example.com",
                password: "123"
            });
            expect(result4.success).toBe(false);
        });

        it("3. deve retornar erro 409 se violar unicidade de slug/email/url no mesmo enterprise", async () => {
            const p2002Error = new Error("Unique constraint");
            (p2002Error as any).code = "P2002";
            (p2002Error as any).meta = { target: ["slug", "enterprise_id"] };

            (prisma.influencer.create as jest.Mock).mockRejectedValue(p2002Error);

            await expect(createInfluencer("ent1", {
                name: "Fulano",
                slug: "fulano",
                personalUrl: "https://example.com"
            })).rejects.toMatchObject({
                statusCode: 409,
                message: "Já existe um influenciador com este slug nesta empresa."
            });
        });

        it("4. deve listar influenciadores limitados ao tenant (enterpriseId)", async () => {
            (prisma.influencer.findMany as jest.Mock).mockResolvedValue([{ id: "inf1" }]);

            const result = await getInfluencers("ent1");

            expect(prisma.influencer.findMany).toHaveBeenCalledWith({
                where: { enterpriseId: "ent1" },
                orderBy: { createAt: 'desc' }
            });
            expect(result.length).toBe(1);
        });

        it("5. deve buscar um influenciador pelo ID confirmando enterpriseId", async () => {
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue({ id: "inf1" });

            const result = await getInfluencerById("inf1", "ent1");

            expect(prisma.influencer.findFirst).toHaveBeenCalledWith({
                where: { id: "inf1", enterpriseId: "ent1" }
            });
            expect(result?.id).toBe("inf1");
        });

        it("6. deve impedir de buscar influenciador de outro tenant e retornar 404", async () => {
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(getInfluencerById("inf2", "ent1")).rejects.toMatchObject({
                statusCode: 404,
                message: "Influenciador não encontrado ou acesso negado"
            });
        });

        it("7. deve atualizar influenciador com sucesso (valida acesso ao tenant)", async () => {
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue({ id: "inf1" });
            (prisma.influencer.update as jest.Mock).mockResolvedValue({ id: "inf1", name: "Ciclano" });

            const result = await updateInfluencer("inf1", "ent1", { name: "Ciclano" });

            expect(prisma.influencer.update).toHaveBeenCalledWith({
                where: { id: "inf1" },
                data: expect.objectContaining({
                    name: "Ciclano"
                })
            });
            expect(result?.name).toBe("Ciclano");
        });

        it("8. deve impedir atualização de influenciador de outro tenant e retornar 404", async () => {
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue(null); // findById falha

            await expect(updateInfluencer("inf1", "ent2", { name: "Novo" })).rejects.toMatchObject({
                statusCode: 404,
                message: "Influenciador não encontrado ou acesso negado"
            });
            expect(prisma.influencer.update).not.toHaveBeenCalled();
        });

        it("9. deve remover influenciador com sucesso (valida acesso ao tenant)", async () => {
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue({ id: "inf1" });

            await deleteInfluencer("inf1", "ent1");

            expect(prisma.influencer.delete).toHaveBeenCalledWith({
                where: { id: "inf1" }
            });
        });

        it("10. deve impedir exclusão de influenciador de outro tenant e retornar 404", async () => {
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue(null); // findById falha

            await expect(deleteInfluencer("inf1", "ent2")).rejects.toMatchObject({
                statusCode: 404,
                message: "Influenciador não encontrado ou acesso negado"
            });
            expect(prisma.influencer.delete).not.toHaveBeenCalled();
        });
    });

    describe("Public Validation", () => {
        it("11. deve retornar influenciador público quando domínio e slug combinam no mesmo tenant", async () => {
            const mockApp = { id: "app1", domain: "kzngg.com" };
            const mockInfluencer = { id: "inf1", name: "Fulano", slug: "fulano" };
            
            // @ts-ignore
            prisma.application = { findUnique: jest.fn().mockResolvedValue(mockApp) };
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue(mockInfluencer);

            const { getPublicInfluencerBySlug } = require("./influencer.service");
            const result = await getPublicInfluencerBySlug("fulano", "kzngg.com");

            expect(prisma.application.findUnique).toHaveBeenCalledWith({
                where: { domain: "kzngg.com" }
            });
            expect(prisma.influencer.findFirst).toHaveBeenCalledWith({
                where: {
                    slug: "fulano",
                    enterprise: { applicationId: "app1" }
                },
                select: expect.any(Object)
            });
            expect(result).toEqual(mockInfluencer);
        });

        it("12. deve retornar 403 se o domínio for inexistente", async () => {
            // @ts-ignore
            prisma.application = { findUnique: jest.fn().mockResolvedValue(null) };

            const { getPublicInfluencerBySlug } = require("./influencer.service");
            await expect(getPublicInfluencerBySlug("fulano", "fake.com")).rejects.toMatchObject({
                statusCode: 403,
                message: "Aplicação não encontrada para este domínio."
            });
        });

        it("13. deve retornar 404 se o slug não existir ou pertencer a outro domínio/tenant", async () => {
            const mockApp = { id: "app1", domain: "kzngg.com" };
            // @ts-ignore
            prisma.application = { findUnique: jest.fn().mockResolvedValue(mockApp) };
            (prisma.influencer.findFirst as jest.Mock).mockResolvedValue(null);

            const { getPublicInfluencerBySlug } = require("./influencer.service");
            await expect(getPublicInfluencerBySlug("wrong-slug", "kzngg.com")).rejects.toMatchObject({
                statusCode: 404,
                message: "Influenciador não encontrado."
            });
        });
    });
});
