"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onlyUsers = void 0;
const appError_1 = require("../errors/appError");
const onlyUsers = (req, res, next) => {
    try {
        if (!req.user) {
            throw new appError_1.AppError("Não autorizado", 401);
        }
        if (req.user.accountType !== "USER") {
            throw new appError_1.AppError("Acesso negado", 403);
        }
        return next();
    }
    catch (error) {
        return next(error);
    }
};
exports.onlyUsers = onlyUsers;
