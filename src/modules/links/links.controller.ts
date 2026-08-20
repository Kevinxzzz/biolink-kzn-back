import { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/errors/appError";
import { createLinkZod, updateLinkZod, reorderLinksZod } from "../../shared/zod/links.zod";
import * as linksService from "./links.service";

export const create = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsedData = createLinkZod.parse(req.body);
        const enterpriseId = req.user!.enterpriseId;

        const result = await linksService.createLink(enterpriseId, parsedData);

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
        const categoryId = req.query.categoryId as string | undefined;
        const result = await linksService.getLinks(enterpriseId, categoryId);

        return res.status(200).json({ data: result });
    } catch (error) {
        next(error);
    }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enterpriseId = req.user!.enterpriseId;
        const id = req.params.id as string;

        const result = await linksService.getLinkById(id, enterpriseId);

        return res.status(200).json({ data: result });
    } catch (error) {
        next(error);
    }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsedData = updateLinkZod.parse(req.body);
        const enterpriseId = req.user!.enterpriseId;
        const id = req.params.id as string;

        const result = await linksService.updateLink(id, enterpriseId, parsedData);

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

        await linksService.deleteLink(id, enterpriseId);

        return res.status(204).send();
    } catch (error) {
        next(error);
    }
};

export const activate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enterpriseId = req.user!.enterpriseId;
        const id = req.params.id as string;

        const result = await linksService.activateLink(id, enterpriseId);

        return res.status(200).json({ data: result });
    } catch (error) {
        next(error);
    }
};

export const reorder = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsedData = reorderLinksZod.parse(req.body);
        const enterpriseId = req.user!.enterpriseId;

        const result = await linksService.reorderLinks(enterpriseId, parsedData);

        return res.status(200).json({ data: result });
    } catch (error: any) {
        if (error.name === "ZodError") {
            const message = error.issues?.[0]?.message || "Os dados informados são inválidos.";
            return next(new AppError(message, 400));
        }
        next(error);
    }
};
