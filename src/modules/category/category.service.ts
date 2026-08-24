import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/appError";
import type { CreateCategoryInput, UpdateCategoryInput } from "../../shared/zod/category.zod";

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

            await tx.categoryRotation.create({
                data: {
                    categoryId: newCategory.id,
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
