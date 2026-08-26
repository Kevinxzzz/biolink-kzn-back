import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/appError";

/**
 * Middleware para garantir isolamento de dados entre empresas (multi-tenancy).
 * Valida se o enterpriseId do usuário autenticado coincide com o enterpriseId do recurso solicitado.
 */
export const checkEnterprise = (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            throw new AppError("Não autorizado", 401);
        }

        const targetEnterpriseId =
            (req.params.enterpriseId as string) ||
            (req.headers["x-enterprise-id"] as string) ||
            (req.query.enterpriseId as string);

        if (targetEnterpriseId && req.user.enterpriseId !== targetEnterpriseId) {
            throw new AppError("Acesso negado", 403);
        }

        return next();
    } catch (error) {
        return next(error);
    }
};
