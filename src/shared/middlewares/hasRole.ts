import { Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";
import { AppError } from "../errors/appError";

export const hasRole = (...roles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                throw new AppError("Não autorizado", 401);
            }

            if (req.user.accountType !== "USER" || !req.user.role || !roles.includes(req.user.role)) {
                throw new AppError("Acesso negado", 403);
            }

            return next();
        } catch (error) {
            return next(error);
        }
    };
};
