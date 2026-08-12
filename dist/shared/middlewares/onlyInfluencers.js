"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onlyInfluencers = void 0;
const appError_1 = require("../errors/appError");
const onlyInfluencers = (req, res, next) => {
    try {
        if (!req.user) {
            throw new appError_1.AppError("Não autorizado", 401);
        }
        if (req.user.accountType !== "INFLUENCER") {
            throw new appError_1.AppError("Acesso negado", 403);
        }
        return next();
    }
    catch (error) {
        return next(error);
    }
};
exports.onlyInfluencers = onlyInfluencers;
