import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/appError";

export const onlyInfluencers = (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            throw new AppError("Não autorizado", 401);
        }

        if (req.user.accountType !== "INFLUENCER") {
            throw new AppError("Acesso negado", 403);
        }

        return next();
    } catch (error) {
        return next(error);
    }
};
