"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCategory = exports.updateCategory = exports.getCategoryById = exports.getCategories = exports.createCategory = void 0;
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
        return await prisma_1.prisma.enterpriseCategory.create({
            data: {
                name: data.name,
                enterpriseId,
                createAt: new Date(),
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
