import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { AppError } from "../errors/appError";

const handler = (req: Request, res: Response, next: NextFunction) => {
    next(new AppError(
        "Limite de requisições excedido. Tente novamente mais tarde.",
        429
    ));
};

export const authLimiter = rateLimit({
    windowMs: 60 * 5000,
    max: 10,
    handler
});

