import { Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";
import { AppError } from "../errors/appError";

export const hasRole = (...roles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user || !req.user.role) {
                throw new AppError("Acesso negado", 403);
            }

            if (!roles.includes(req.user.role)) {
                throw new AppError("Acesso negado", 403);
            }

            return next();
        } catch (error) {
            return next(error);
        }
    };
};
