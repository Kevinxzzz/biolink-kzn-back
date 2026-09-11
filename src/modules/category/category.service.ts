import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/appError";
import type { CreateCategoryInput, UpdateCategoryInput, UpdateCategoryRotationInput } from "../../shared/zod/category.zod";

const categorySelect = {
    id: true,
    name: true,
    createAt: true,
    updateAt: true,
};

export const createCategory = async (enterpriseId: string, data: CreateCategoryInput) => {
    try {
        return await prisma.$transaction(async (tx) => {
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
    } catch (error: any) {
        if (error.code === 'P2002') {
            throw new AppError("Já existe uma categoria com este nome na sua empresa", 409);
        }
        throw error;
    }
};

export const getCategories = async (enterpriseId: string) => {
    return await prisma.enterpriseCategory.findMany({
        where: { enterpriseId },
        select: categorySelect,
        orderBy: { name: 'asc' }
    });
};

export const getCategoryById = async (id: string, enterpriseId: string) => {
    const category = await prisma.enterpriseCategory.findFirst({
        where: { id, enterpriseId },
        select: categorySelect
    });
    if (!category) throw new AppError("Categoria não encontrada", 404);
    return category;
};

export const updateCategory = async (id: string, enterpriseId: string, data: UpdateCategoryInput) => {
    const categoryExists = await prisma.enterpriseCategory.findFirst({
        where: { id, enterpriseId }
    });
    if (!categoryExists) throw new AppError("Categoria não encontrada ou acesso negado", 404);

    try {
        return await prisma.enterpriseCategory.update({
            where: { id },
            data: {
                ...data,
                updateAt: new Date()
            },
            select: categorySelect
        });
    } catch (error: any) {
        if (error.code === 'P2002') {
            throw new AppError("Já existe uma categoria com este nome na sua empresa", 409);
        }
        throw error;
    }
};

export const deleteCategory = async (id: string, enterpriseId: string) => {
    const categoryExists = await prisma.enterpriseCategory.findFirst({
        where: { id, enterpriseId }
    });
    if (!categoryExists) throw new AppError("Categoria não encontrada ou acesso negado", 404);

    return await prisma.enterpriseCategory.delete({
        where: { id }
    });
};

export const getCategoryRotationConfig = async (id: string, enterpriseId: string) => {
    const category = await prisma.enterpriseCategory.findFirst({
        where: { id, enterpriseId },
        include: { categoryRotation: true }
    });

    if (!category) {
        throw new AppError("Categoria não encontrada ou acesso negado", 404);
    }

    if (!category.categoryRotation) {
        throw new AppError("Configuração de rotação não encontrada para esta categoria", 404);
    }

    return category.categoryRotation;
};

export const updateCategoryRotationConfig = async (id: string, enterpriseId: string, data: UpdateCategoryRotationInput) => {
    // Busca a categoria e verifica posse usando FOR UPDATE para garantir consistência
    return await prisma.$transaction(async (tx) => {
        const categoryExists = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM "enterprise_category" 
            WHERE "id" = ${id}::uuid AND "enterprise_id" = ${enterpriseId}::uuid 
            FOR UPDATE
        `;

        if (!categoryExists || categoryExists.length === 0) {
            throw new AppError("Categoria não encontrada ou acesso negado", 404);
        }

        // Sanitização de estado baseado no tipo da rotação
        let limitClicks = null;
        let timerInMinutes = null;
        let timerStartedAt = null;

        if (data.toggleType === "LIMITCLICKS") {
            limitClicks = data.limitClicks ?? null;
        } else if (data.toggleType === "TIMER") {
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

export const updateAllCategoriesRotationConfig = async (enterpriseId: string, data: UpdateCategoryRotationInput) => {
    return await prisma.$transaction(async (tx) => {
        const categories = await tx.$queryRaw<{ id: string }[]>`
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
        } else if (data.toggleType === "TIMER") {
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

export const getRotationType = async (enterpriseId?: string) => {
    const rotation = await prisma.categoryRotation.findFirst({
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

    const anyRotation = await prisma.categoryRotation.findFirst({
        select: {
            toggleType: true,
            limitClicks: true,
            timerInMinutes: true,
            timerStartedAt: true

        }
    });

    return anyRotation;
};

export const getPublicCategories = async (domain: string) => {
    const app = await prisma.application.findUnique({ where: { domain } });
    if (!app) {
        throw new AppError("Aplicação não encontrada para este domínio.", 403);
    }

    const categories = await prisma.enterpriseCategory.findMany({
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
