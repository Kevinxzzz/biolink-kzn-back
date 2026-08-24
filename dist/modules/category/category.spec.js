"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const category_service_1 = require("./category.service");
const prisma_1 = require("../../shared/database/prisma");
const category_zod_1 = require("../../shared/zod/category.zod");
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
    let mockTx;
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
        prisma_1.prisma.$transaction.mockImplementation(async (cb) => {
            return await cb(mockTx);
        });
        jest.clearAllMocks();
    });
    describe("CRUD", () => {
        it("1. deve criar categoria com sucesso", async () => {
            mockTx.enterpriseCategory.create.mockResolvedValue({ id: "cat1", name: "Free Fire" });
            mockTx.categoryRotation.create.mockResolvedValue({ id: "rot1", categoryId: "cat1" });
            const result = await (0, category_service_1.createCategory)("ent1", { name: "Free Fire" });
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
            const emptyName = category_zod_1.createCategoryZod.safeParse({ name: "" });
            expect(emptyName.success).toBe(false);
            const extraFields = category_zod_1.createCategoryZod.safeParse({ name: "Test", id: "123" });
            expect(extraFields.success).toBe(false); // due to .strict()
        });
        it("3. deve listar categorias restritas à empresa autenticada", async () => {
            prisma_1.prisma.enterpriseCategory.findMany.mockResolvedValue([{ id: "cat1" }]);
            const result = await (0, category_service_1.getCategories)("ent1");
            expect(prisma_1.prisma.enterpriseCategory.findMany).toHaveBeenCalledWith({
                where: { enterpriseId: "ent1" },
                select: expect.any(Object),
                orderBy: { name: 'asc' }
            });
            expect(result.length).toBe(1);
        });
        it("4. deve buscar categoria existente da empresa", async () => {
            prisma_1.prisma.enterpriseCategory.findFirst.mockResolvedValue({ id: "cat1" });
            const result = await (0, category_service_1.getCategoryById)("cat1", "ent1");
            expect(prisma_1.prisma.enterpriseCategory.findFirst).toHaveBeenCalledWith({
                where: { id: "cat1", enterpriseId: "ent1" },
                select: expect.any(Object)
            });
            expect(result.id).toBe("cat1");
        });
        it("5. deve impedir acesso a categoria inexistente ou de outra empresa", async () => {
            prisma_1.prisma.enterpriseCategory.findFirst.mockResolvedValue(null);
            await expect((0, category_service_1.getCategoryById)("cat1", "ent2")).rejects.toMatchObject({
                statusCode: 404,
                message: "Categoria não encontrada"
            });
        });
        it("6. deve atualizar categoria da empresa", async () => {
            prisma_1.prisma.enterpriseCategory.findFirst.mockResolvedValue({ id: "cat1" });
            prisma_1.prisma.enterpriseCategory.update.mockResolvedValue({ id: "cat1", name: "Novo Nome" });
            const result = await (0, category_service_1.updateCategory)("cat1", "ent1", { name: "Novo Nome" });
            expect(prisma_1.prisma.enterpriseCategory.update).toHaveBeenCalledWith({
                where: { id: "cat1" },
                data: expect.objectContaining({ name: "Novo Nome" }),
                select: expect.any(Object)
            });
            expect(result.name).toBe("Novo Nome");
        });
        it("7. deve impedir atualização de categoria indevida", async () => {
            prisma_1.prisma.enterpriseCategory.findFirst.mockResolvedValue(null);
            await expect((0, category_service_1.updateCategory)("cat1", "ent2", { name: "Nome" })).rejects.toMatchObject({
                statusCode: 404,
                message: "Categoria não encontrada ou acesso negado"
            });
        });
        it("8. deve excluir categoria com sucesso (confiando no cascade do banco)", async () => {
            prisma_1.prisma.enterpriseCategory.findFirst.mockResolvedValue({ id: "cat1" });
            prisma_1.prisma.enterpriseCategory.delete.mockResolvedValue({ id: "cat1" });
            await (0, category_service_1.deleteCategory)("cat1", "ent1");
            expect(prisma_1.prisma.enterpriseCategory.findFirst).toHaveBeenCalledWith({
                where: { id: "cat1", enterpriseId: "ent1" }
            });
            expect(prisma_1.prisma.enterpriseCategory.delete).toHaveBeenCalledWith({
                where: { id: "cat1" }
            });
        });
        it("9. deve impedir exclusão de categoria indevida", async () => {
            prisma_1.prisma.enterpriseCategory.findFirst.mockResolvedValue(null);
            await expect((0, category_service_1.deleteCategory)("cat1", "ent2")).rejects.toMatchObject({
                statusCode: 404,
                message: "Categoria não encontrada ou acesso negado"
            });
        });
        it("10. deve retornar conflito caso crie com nome duplicado na mesma empresa", async () => {
            const p2002Error = new Error("Unique constraint");
            p2002Error.code = "P2002";
            mockTx.enterpriseCategory.create.mockRejectedValue(p2002Error);
            await expect((0, category_service_1.createCategory)("ent1", { name: "Free Fire" })).rejects.toMatchObject({
                statusCode: 409,
                message: "Já existe uma categoria com este nome na sua empresa"
            });
        });
    });
});
