"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const appError_1 = require("../errors/appError");
const env_1 = require("../config/env");
/**
 * Middleware global de tratamento de erros do Express.
 * Trata exceções AppError retornando o statusCode e mensagem correspondente.
 * Trata erros não previstos retornando HTTP 500 sem expor detalhes sensíveis/stack traces.
 */
const errorHandler = (err, req, res, next) => {
    if (err instanceof appError_1.AppError) {
        return res.status(err.statusCode).json({
            message: err.message
        });
    }
    if (env_1.env.NODE_ENV !== "test") {
        console.error("Internal Server Error:", err);
    }
    return res.status(500).json({
        message: "Erro interno do servidor"
    });
};
exports.errorHandler = errorHandler;
