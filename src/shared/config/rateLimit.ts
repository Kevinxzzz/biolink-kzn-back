import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { AppError } from "../errors/appError";

const handler = (_req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(
        "Limite de requisições excedido. Tente novamente mais tarde.",
        429
    ));
};

export const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    handler
});

