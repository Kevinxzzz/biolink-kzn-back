"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkEnterprise = void 0;
const appError_1 = require("../errors/appError");
/**
 * Middleware para garantir isolamento de dados entre empresas (multi-tenancy).
 * Valida se o enterpriseId do usuário autenticado coincide com o enterpriseId do recurso solicitado.
 */
const checkEnterprise = (req, res, next) => {
    try {
        if (!req.user) {
            throw new appError_1.AppError("Não autorizado", 401);
        }
        const targetEnterpriseId = req.params.enterpriseId ||
            req.headers["x-enterprise-id"] ||
            req.query.enterpriseId;
        if (targetEnterpriseId && req.user.enterpriseId !== targetEnterpriseId) {
            throw new appError_1.AppError("Acesso negado", 403);
        }
        return next();
    }
    catch (error) {
        return next(error);
    }
};
exports.checkEnterprise = checkEnterprise;
