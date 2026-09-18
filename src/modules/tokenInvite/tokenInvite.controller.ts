import type { NextFunction, Request, Response } from "express";
import { createTokenInviteZod, registerViaTokenZod } from "../../shared/zod/tokenInvite.zod";
import * as tokenInviteService from "./tokenInvite.service";
import { AppError } from "../../shared/errors/appError";
import { extractDomain } from "../../shared/utils/domain";

export const create = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            throw new AppError("Não autorizado", 401);
        }

        const parsedData = createTokenInviteZod.parse(req.body);
        const result = await tokenInviteService.createTokenInvite(parsedData, req.user.enterpriseId, req.user.id);
        
        return res.status(201).json({ message: "Convite criado com sucesso", data: result });
    } catch (error: any) {
        if (error.name === "ZodError") {
            next(new AppError("Os dados informados são inválidos.", 400));
            return;
        }
        next(error);
    }
};

export const list = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            throw new AppError("Não autorizado", 401);
        }

        const result = await tokenInviteService.listTokenInvites(req.user.enterpriseId);
        
        // Monta o link para cada convite, usando o domínio da aplicação logada
        // A arquitetura assume req.user.applicationId vem do authenticate.ts, vamos buscar ou usar apenas o token
        // Porém o link publico será `https://${domain}/register/invite/${token}`.
        // O `authenticate.ts` tem access to req.user.applicationId mas não ao domain diretamente se não consultarmos.
        // O requestDomain pode vir do request da chamada do list, que já foi extraído pelo middleware de auth e batido no banco.
        const domain = extractDomain(req);
        
        const dataWithLinks = result.map(t => ({
            ...t,
            link: domain ? `https://${domain}/register/invite/${t.token}` : null
        }));

        return res.status(200).json(dataWithLinks);
    } catch (error: any) {
        next(error);
    }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            throw new AppError("Não autorizado", 401);
        }

        const id = req.params.id as string;
        const result = await tokenInviteService.deleteTokenInvite(id, req.user.enterpriseId);
        
        return res.status(200).json(result);
    } catch (error: any) {
        next(error);
    }
};

export const validate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.params.token as string;
        const domain = extractDomain(req);

        if (!domain) {
            throw new AppError("Domínio não identificado.", 400);
        }

        const result = await tokenInviteService.validateToken(token, domain);
        
        return res.status(200).json(result);
    } catch (error: any) {
        next(error);
    }
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.params.token as string;
        const domain = extractDomain(req);

        if (!domain) {
            throw new AppError("Domínio não identificado.", 400);
        }

        const parsedData = registerViaTokenZod.parse(req.body);
        const result = await tokenInviteService.registerViaToken(token, domain, parsedData);
        
        return res.status(201).json(result);
    } catch (error: any) {
        if (error.name === "ZodError") {
            next(new AppError("Os dados informados são inválidos.", 400));
            return;
        }
        next(error);
    }
};
