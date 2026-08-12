import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/appError";

export const onlyUsers = (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            throw new AppError("Não autorizado", 401);
        }

        if (req.user.accountType !== "USER") {
            throw new AppError("Acesso negado", 403);
        }

        return next();
    } catch (error) {
        return next(error);
    }
};
