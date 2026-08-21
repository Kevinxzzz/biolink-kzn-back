import { createCategory, getCategories, getCategoryById, updateCategory, deleteCategory } from "./category.service";
import { prisma } from "../../shared/database/prisma";
import { createCategoryZod, updateCategoryZod } from "../../shared/zod/category.zod";

jest.mock("../../shared/database/prisma", () => ({
    prisma: {
        $transaction: jest.fn(),
        enterpriseCategory: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        },
        categoryRotation: {
            create: jest.fn()
        }
    }
}));

describe("Category Module", () => {
    let mockTx: any;

    beforeEach(() => {
        mockTx = {
            enterpriseCategory: {
                create: jest.fn(),
                findMany: jest.fn(),
                findFirst: jest.fn(),
                update: jest.fn(),
                delete: jest.fn()
            },
            categoryRotation: {
                create: jest.fn()
            }
        };

        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
            return await cb(mockTx);
        });

        jest.clearAllMocks();
    });

    describe("CRUD", () => {
        it("1. deve criar categoria com sucesso", async () => {
            mockTx.enterpriseCategory.create.mockResolvedValue({ id: "cat1", name: "Free Fire" });
            mockTx.categoryRotation.create.mockResolvedValue({ id: "rot1", categoryId: "cat1" });

            const result = await createCategory("ent1", { name: "Free Fire" });

            expect(mockTx.enterpriseCategory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ name: "Free Fire", enterpriseId: "ent1" }),
                select: expect.any(Object)
            });
            expect(mockTx.categoryRotation.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ categoryId: "cat1" })
            });
            expect(result.id).toBe("cat1");
        });

        it("2. deve impedir criação inválida pelo Zod", () => {
            const emptyName = createCategoryZod.safeParse({ name: "" });
            expect(emptyName.success).toBe(false);

            const extraFields = createCategoryZod.safeParse({ name: "Test", id: "123" });
            expect(extraFields.success).toBe(false); // due to .strict()
        });

        it("3. deve listar categorias restritas à empresa autenticada", async () => {
            (prisma.enterpriseCategory.findMany as jest.Mock).mockResolvedValue([{ id: "cat1" }]);

            const result = await getCategories("ent1");

            expect(prisma.enterpriseCategory.findMany).toHaveBeenCalledWith({
                where: { enterpriseId: "ent1" },
                select: expect.any(Object),
                orderBy: { name: 'asc' }
            });
            expect(result.length).toBe(1);
        });

        it("4. deve buscar categoria existente da empresa", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue({ id: "cat1" });

            const result = await getCategoryById("cat1", "ent1");

            expect(prisma.enterpriseCategory.findFirst).toHaveBeenCalledWith({
                where: { id: "cat1", enterpriseId: "ent1" },
                select: expect.any(Object)
            });
            expect(result.id).toBe("cat1");
        });

        it("5. deve impedir acesso a categoria inexistente ou de outra empresa", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(getCategoryById("cat1", "ent2")).rejects.toMatchObject({
                statusCode: 404,
                message: "Categoria não encontrada"
            });
        });

        it("6. deve atualizar categoria da empresa", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue({ id: "cat1" });
            (prisma.enterpriseCategory.update as jest.Mock).mockResolvedValue({ id: "cat1", name: "Novo Nome" });

            const result = await updateCategory("cat1", "ent1", { name: "Novo Nome" });

            expect(prisma.enterpriseCategory.update).toHaveBeenCalledWith({
                where: { id: "cat1" },
                data: expect.objectContaining({ name: "Novo Nome" }),
                select: expect.any(Object)
            });
            expect(result.name).toBe("Novo Nome");
        });

        it("7. deve impedir atualização de categoria indevida", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(updateCategory("cat1", "ent2", { name: "Nome" })).rejects.toMatchObject({
                statusCode: 404,
                message: "Categoria não encontrada ou acesso negado"
            });
        });

        it("8. deve excluir categoria com sucesso (confiando no cascade do banco)", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue({ id: "cat1" });
            (prisma.enterpriseCategory.delete as jest.Mock).mockResolvedValue({ id: "cat1" });

            await deleteCategory("cat1", "ent1");

            expect(prisma.enterpriseCategory.findFirst).toHaveBeenCalledWith({
                where: { id: "cat1", enterpriseId: "ent1" }
            });
            expect(prisma.enterpriseCategory.delete).toHaveBeenCalledWith({
                where: { id: "cat1" }
            });
        });

        it("9. deve impedir exclusão de categoria indevida", async () => {
            (prisma.enterpriseCategory.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(deleteCategory("cat1", "ent2")).rejects.toMatchObject({
                statusCode: 404,
                message: "Categoria não encontrada ou acesso negado"
            });
        });
        
        it("10. deve retornar conflito caso crie com nome duplicado na mesma empresa", async () => {
            const p2002Error = new Error("Unique constraint");
            (p2002Error as any).code = "P2002";
            mockTx.enterpriseCategory.create.mockRejectedValue(p2002Error);
            
            await expect(createCategory("ent1", { name: "Free Fire" })).rejects.toMatchObject({
                statusCode: 409,
                message: "Já existe uma categoria com este nome na sua empresa"
            });
        });
    });
});
