import rateLimit from "express-rate-limit";
import { AppError } from "../errors/appError";

const handler = () => {
    throw new AppError(
        "Limite de requisições excedido. Tente novamente mais tarde.",
        429
    );
};

export const authLimiter = rateLimit({
    windowMs: 60 * 5000,
    max: 5,
    handler
})

