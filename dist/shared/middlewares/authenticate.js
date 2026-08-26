"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const prisma_1 = require("../database/prisma");
const appError_1 = require("../errors/appError");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            throw new appError_1.AppError("Token não fornecido", 401);
        }
        const [, token] = authHeader.split(" ");
        if (!token) {
            throw new appError_1.AppError("Token inválido", 401);
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET, {
                algorithms: ["HS256"]
            });
        }
        catch (error) {
            throw new appError_1.AppError("Token expirado ou inválido", 401);
        }
        if (payload.accountType !== "USER" && payload.accountType !== "INFLUENCER") {
            throw new appError_1.AppError("Token inválido", 401);
        }
        let userRecord = null;
        if (payload.accountType === "USER") {
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: payload.sub },
                select: {
                    id: true,
                    email: true,
                    enterpriseId: true,
                    role: {
                        select: {
                            role: true
                        }
                    }
                }
            });
            if (user) {
                userRecord = {
                    id: user.id,
                    email: user.email,
                    enterpriseId: user.enterpriseId,
                    accountType: "USER",
                    role: user.role.role
                };
            }
        }
        else if (payload.accountType === "INFLUENCER") {
            const influencer = await prisma_1.prisma.influencer.findUnique({
                where: { id: payload.sub },
                select: { id: true, email: true, enterpriseId: true }
            });
            if (influencer) {
                userRecord = {
                    id: influencer.id,
                    email: influencer.email,
                    enterpriseId: influencer.enterpriseId,
                    accountType: "INFLUENCER"
                };
            }
        }
        if (!userRecord) {
            throw new appError_1.AppError("Usuário não encontrado", 401);
        }
        req.user = userRecord;
        return next();
    }
    catch (error) {
        return next(error);
    }
};
exports.authenticate = authenticate;
