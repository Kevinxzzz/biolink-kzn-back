"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasRole = void 0;
const appError_1 = require("../errors/appError");
const hasRole = (...roles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw new appError_1.AppError("Não autorizado", 401);
            }
            if (req.user.accountType !== "USER" || !req.user.role || !roles.includes(req.user.role)) {
                throw new appError_1.AppError("Acesso negado", 403);
            }
            return next();
        }
        catch (error) {
            return next(error);
        }
    };
};
exports.hasRole = hasRole;
