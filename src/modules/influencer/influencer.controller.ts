import { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/errors/appError";
import { createInfluencerZod, updateInfluencerZod } from "../../shared/zod/influencer.zod";
import * as influencerService from "./influencer.service";
import { extractDomain, extractBaseUrl } from "../../shared/utils/domain";

export const getPublicBySlug = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log("[DEBUG API] Request recebido em getPublicBySlug", { 
            hostname: req.hostname, 
            host: req.headers.host, 
            origin: req.headers.origin, 
            forwardedHost: req.headers["x-forwarded-host"], 
            url: req.originalUrl 
        });

        const domain = extractDomain(req);
        if (!domain) {
            return next(new AppError("Domínio não identificado na requisição.", 403));
        }

        const slug = req.params.slug as string;
        if (!slug || slug.trim() === "") {
            return next(new AppError("Slug não informado.", 400));
        }

        const result = await influencerService.getPublicInfluencerBySlug(slug, domain);

        return res.status(200).json({ data: result });
    } catch (error) {
        next(error);
    }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            return next(new AppError("Não autorizado", 401));
        }

        const parsedData = createInfluencerZod.parse(req.body);
        const enterpriseId = req.user.enterpriseId;
        const baseUrl = extractBaseUrl(req);

        if (!baseUrl) {
            return next(new AppError("Não foi possível extrair a URL base da requisição.", 400));
        }

        const result = await influencerService.createInfluencer(enterpriseId, parsedData, baseUrl);

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
        if (!req.user || !req.user.enterpriseId) {
            return next(new AppError("Não autorizado", 401));
        }

        const enterpriseId = req.user.enterpriseId;
        const result = await influencerService.getInfluencers(enterpriseId);

        return res.status(200).json({ data: result });
    } catch (error) {
        next(error);
    }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            return next(new AppError("Não autorizado", 401));
        }

        const id = req.params.id as string;
        if (!id) {
            return next(new AppError("ID do influenciador não informado.", 400));
        }

        const enterpriseId = req.user.enterpriseId;
        const result = await influencerService.getInfluencerById(id, enterpriseId);

        return res.status(200).json({ data: result });
    } catch (error) {
        next(error);
    }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            return next(new AppError("Não autorizado", 401));
        }

        const id = req.params.id as string;
        if (!id) {
            return next(new AppError("ID do influenciador não informado.", 400));
        }

        const parsedData = updateInfluencerZod.parse(req.body);
        const enterpriseId = req.user.enterpriseId;

        const baseUrl = extractBaseUrl(req);

        if (!baseUrl) {
            return next(new AppError("Não foi possível extrair a URL base da requisição.", 400));
        }

        const result = await influencerService.updateInfluencer(id, enterpriseId, parsedData, baseUrl);

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
        if (!req.user || !req.user.enterpriseId) {
            return next(new AppError("Não autorizado", 401));
        }

        const id = req.params.id as string;
        if (!id) {
            return next(new AppError("ID do influenciador não informado.", 400));
        }

        const enterpriseId = req.user.enterpriseId;
        await influencerService.deleteInfluencer(id, enterpriseId);

        return res.status(204).send();
    } catch (error) {
        next(error);
    }
};
