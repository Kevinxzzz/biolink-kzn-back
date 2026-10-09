import { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/errors/appError";
import { createLinkZod, updateLinkZod, reorderLinksZod } from "../../shared/zod/links.zod";
import * as linksService from "./links.service";
import { extractDomain } from "../../shared/utils/domain";
import { resolveUserAuth } from "../../shared/middlewares/authenticate";
import { readAuthCookie, readVisitorCookie, setVisitorCookie, parseVisitorPayload, VisitorCookiePayload } from "../../shared/utils/cookie";

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

export const redirect = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const categoryId = req.params.categoryId as string;
        const influencerSlug = req.query.influencer as string | undefined;

        // ─── Passo 1: Tentar resolver autenticação pelo cookie ────────────────
        // Usa a mesma função do middleware `authenticate`, mas de forma silenciosa:
        // ausência de cookie ou token inválido → trata como visitante, sem lançar erro.
        let isAuthenticated = false;
        const authToken = readAuthCookie(req);

        if (authToken) {
            try {
                const requestDomain = extractDomain(req);
                const user = await resolveUserAuth(authToken, requestDomain);
                isAuthenticated = user !== null;
            } catch {
                // Token inválido ou expirado → trata como visitante
                isAuthenticated = false;
            }
        }

        // ─── Passo 2: Identificar visitante (se não autenticado) ─────────────
        // Se autenticado, não lemos nem gravamos o cookie de visitante.
        let visitorPayload: VisitorCookiePayload | undefined;

        if (!isAuthenticated) {
            const rawCookie = readVisitorCookie(req);
            visitorPayload = parseVisitorPayload(rawCookie) || undefined;

            if (!visitorPayload) {
                // Gera um payload inicial, sem persistir imediatamente (será persistido se modificado)
                visitorPayload = { id: crypto.randomUUID(), categories: {} };
            }
        }

        // ─── Passo 3: Delegar ao service com as flags de controle ─────────────
        const result = await linksService.processClickAndRedirect(categoryId, {
            influencerSlug,
            shouldCountClick: !isAuthenticated,
            visitorPayload,
        });

        // Se o serviço precisou registrar a categoria no payload, nós o persistimos
        if (result.updatedVisitorPayload) {
            setVisitorCookie(res, result.updatedVisitorPayload);
        }

        return res.redirect(result.url);
    } catch (error) {
        next(error);
    }
};

export const redirectOnlyEfootballFromKzn = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await linksService.processClickAndRedirectOnlyEfootball();

        return res.redirect(result.url);
    } catch (error) {
        next(error);
    }
};
