import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/appError";
import { env } from "../config/env";

/**
 * Middleware global de tratamento de erros do Express.
 * Trata exceções AppError retornando o statusCode e mensagem correspondente.
 * Trata erros não previstos retornando HTTP 500 sem expor detalhes sensíveis/stack traces.
 */
export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            message: err.message
        });
    }

    if (env.NODE_ENV !== "test") {
        console.error("Internal Server Error:", err);
    }

    return res.status(500).json({
        message: "Erro interno do servidor"
    });
};
