import { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/errors/appError";
import { createCategoryZod, updateCategoryZod } from "../../shared/zod/category.zod";
import * as categoryService from "./category.service";

export const create = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsedData = createCategoryZod.parse(req.body);
        const enterpriseId = req.user!.enterpriseId;

        const result = await categoryService.createCategory(enterpriseId, parsedData);

        return res.status(201).json({ data: result });
    } catch (error: any) {
        if (error.name === "ZodError") {
            const message = error.issues?.[0]?.message || "Os dados informados são inválidos.";
            return next(new AppError(message, 400));
        }
        next(error);
    }
};

export const list = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enterpriseId = req.user!.enterpriseId;
        const result = await categoryService.getCategories(enterpriseId);

        return res.status(200).json({ data: result });
    } catch (error) {
        next(error);
    }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enterpriseId = req.user!.enterpriseId;
        const id = req.params.id as string;

        const result = await categoryService.getCategoryById(id, enterpriseId);

        return res.status(200).json({ data: result });
    } catch (error) {
        next(error);
    }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsedData = updateCategoryZod.parse(req.body);
        const enterpriseId = req.user!.enterpriseId;
        const id = req.params.id as string;

        const result = await categoryService.updateCategory(id, enterpriseId, parsedData);

        return res.status(200).json({ data: result });
    } catch (error: any) {
        if (error.name === "ZodError") {
            const message = error.issues?.[0]?.message || "Os dados informados são inválidos.";
            return next(new AppError(message, 400));
        }
        next(error);
    }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enterpriseId = req.user!.enterpriseId;
        const id = req.params.id as string;

        await categoryService.deleteCategory(id, enterpriseId);

        return res.status(204).send();
    } catch (error) {
        next(error);
    }
};
