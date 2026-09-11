"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicCategories = exports.getRotationType = exports.updateAllCategoriesRotationConfig = exports.updateCategoryRotationConfig = exports.getCategoryRotationConfig = exports.deleteCategory = exports.updateCategory = exports.getCategoryById = exports.getCategories = exports.createCategory = void 0;
const prisma_1 = require("../../shared/database/prisma");
const appError_1 = require("../../shared/errors/appError");
const categorySelect = {
    id: true,
    name: true,
    createAt: true,
    updateAt: true,
};
const createCategory = async (enterpriseId, data) => {
    try {
        return await prisma_1.prisma.$transaction(async (tx) => {
            const newCategory = await tx.enterpriseCategory.create({
                data: {
                    name: data.name,
                    enterpriseId,
                    createAt: new Date(),
                    updateAt: new Date()
                },
                select: categorySelect
            });
            const existingRotation = await tx.categoryRotation.findFirst({
                where: {
                    enterpriseCategory: {
                        enterpriseId
                    },
                    categoryId: {
                        not: newCategory.id
                    },
                    toggleType: {
                        not: "MANUAL"
                    }
                },
                select: {
                    toggleType: true
                }
            });
            const toggleType = existingRotation ? existingRotation.toggleType : "MANUAL";
            await tx.categoryRotation.create({
                data: {
                    categoryId: newCategory.id,
                    toggleType,
                    updateAt: new Date()
                }
            });
            return newCategory;
        });
    }
    catch (error) {
        if (error.code === 'P2002') {
            throw new appError_1.AppError("Já existe uma categoria com este nome na sua empresa", 409);
        }
        throw error;
    }
};
exports.createCategory = createCategory;
const getCategories = async (enterpriseId) => {
    return await prisma_1.prisma.enterpriseCategory.findMany({
        where: { enterpriseId },
        select: categorySelect,
        orderBy: { name: 'asc' }
    });
};
exports.getCategories = getCategories;
const getCategoryById = async (id, enterpriseId) => {
    const category = await prisma_1.prisma.enterpriseCategory.findFirst({
        where: { id, enterpriseId },
        select: categorySelect
    });
    if (!category)
        throw new appError_1.AppError("Categoria não encontrada", 404);
    return category;
};
exports.getCategoryById = getCategoryById;
const updateCategory = async (id, enterpriseId, data) => {
    const categoryExists = await prisma_1.prisma.enterpriseCategory.findFirst({
        where: { id, enterpriseId }
    });
    if (!categoryExists)
        throw new appError_1.AppError("Categoria não encontrada ou acesso negado", 404);
    try {
        return await prisma_1.prisma.enterpriseCategory.update({
            where: { id },
            data: {
                ...data,
                updateAt: new Date()
            },
            select: categorySelect
        });
    }
    catch (error) {
        if (error.code === 'P2002') {
            throw new appError_1.AppError("Já existe uma categoria com este nome na sua empresa", 409);
        }
        throw error;
    }
};
exports.updateCategory = updateCategory;
const deleteCategory = async (id, enterpriseId) => {
    const categoryExists = await prisma_1.prisma.enterpriseCategory.findFirst({
        where: { id, enterpriseId }
    });
    if (!categoryExists)
        throw new appError_1.AppError("Categoria não encontrada ou acesso negado", 404);
    return await prisma_1.prisma.enterpriseCategory.delete({
        where: { id }
    });
};
exports.deleteCategory = deleteCategory;
const getCategoryRotationConfig = async (id, enterpriseId) => {
    const category = await prisma_1.prisma.enterpriseCategory.findFirst({
        where: { id, enterpriseId },
        include: { categoryRotation: true }
    });
    if (!category) {
        throw new appError_1.AppError("Categoria não encontrada ou acesso negado", 404);
    }
    if (!category.categoryRotation) {
        throw new appError_1.AppError("Configuração de rotação não encontrada para esta categoria", 404);
    }
    return category.categoryRotation;
};
exports.getCategoryRotationConfig = getCategoryRotationConfig;
const updateCategoryRotationConfig = async (id, enterpriseId, data) => {
    // Busca a categoria e verifica posse usando FOR UPDATE para garantir consistência
    return await prisma_1.prisma.$transaction(async (tx) => {
        const categoryExists = await tx.$queryRaw `
            SELECT id FROM "enterprise_category" 
            WHERE "id" = ${id}::uuid AND "enterprise_id" = ${enterpriseId}::uuid 
            FOR UPDATE
        `;
        if (!categoryExists || categoryExists.length === 0) {
            throw new appError_1.AppError("Categoria não encontrada ou acesso negado", 404);
        }
        // Sanitização de estado baseado no tipo da rotação
        let limitClicks = null;
        let timerInMinutes = null;
        let timerStartedAt = null;
        if (data.toggleType === "LIMITCLICKS") {
            limitClicks = data.limitClicks ?? null;
        }
        else if (data.toggleType === "TIMER") {
            timerInMinutes = data.timerInMinutes ?? null;
            timerStartedAt = new Date();
        }
        // Para MANUAL e SCHEDULE os valores permanecem nulos
        return await tx.categoryRotation.update({
            where: { categoryId: id },
            data: {
                toggleType: data.toggleType,
                limitClicks,
                timerInMinutes,
                timerStartedAt,
                updateAt: new Date()
            }
        });
    });
};
exports.updateCategoryRotationConfig = updateCategoryRotationConfig;
const updateAllCategoriesRotationConfig = async (enterpriseId, data) => {
    return await prisma_1.prisma.$transaction(async (tx) => {
        const categories = await tx.$queryRaw `
            SELECT id FROM "enterprise_category" 
            WHERE "enterprise_id" = ${enterpriseId}::uuid 
            FOR UPDATE
        `;
        if (!categories || categories.length === 0) {
            return { count: 0 };
        }
        const categoryIds = categories.map(c => c.id);
        let limitClicks = null;
        let timerInMinutes = null;
        let timerStartedAt = null;
        if (data.toggleType === "LIMITCLICKS") {
            limitClicks = data.limitClicks ?? null;
        }
        else if (data.toggleType === "TIMER") {
            timerInMinutes = data.timerInMinutes ?? null;
            timerStartedAt = new Date();
        }
        const result = await tx.categoryRotation.updateMany({
            where: { categoryId: { in: categoryIds } },
            data: {
                toggleType: data.toggleType,
                limitClicks,
                timerInMinutes,
                timerStartedAt,
                updateAt: new Date()
            }
        });
        return { count: result.count };
    });
};
exports.updateAllCategoriesRotationConfig = updateAllCategoriesRotationConfig;
const getRotationType = async (enterpriseId) => {
    const rotation = await prisma_1.prisma.categoryRotation.findFirst({
        where: enterpriseId ? {
            enterpriseCategory: { enterpriseId }
        } : undefined,
        select: {
            toggleType: true,
            limitClicks: true,
            timerInMinutes: true,
            timerStartedAt: true
        }
    });
    if (rotation) {
        return rotation;
    }
    const anyRotation = await prisma_1.prisma.categoryRotation.findFirst({
        select: {
            toggleType: true,
            limitClicks: true,
            timerInMinutes: true,
            timerStartedAt: true
        }
    });
    return anyRotation;
};
exports.getRotationType = getRotationType;
const getPublicCategories = async (domain) => {
    const app = await prisma_1.prisma.application.findUnique({ where: { domain } });
    if (!app) {
        throw new appError_1.AppError("Aplicação não encontrada para este domínio.", 403);
    }
    const categories = await prisma_1.prisma.enterpriseCategory.findMany({
        where: {
            enterprise: { applicationId: app.id },
            enterpriseUrl: {
                some: { active: true }
            }
        },
        select: {
            id: true,
            name: true
        },
        orderBy: { name: 'asc' }
    });
    return categories;
};
exports.getPublicCategories = getPublicCategories;
