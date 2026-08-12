"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginIn = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../../shared/config/env");
const prisma_1 = require("../../shared/database/prisma");
const appError_1 = require("../../shared/errors/appError");
const loginIn = async ({ email, password }) => {
    const user = await prisma_1.prisma.user.findFirst({
        where: { email: email },
        select: {
            id: true,
            name: true,
            email: true,
            password: true,
            enterpriseId: true,
            role: {
                select: {
                    role: true
                }
            }
        }
    });
    if (!user)
        throw new appError_1.AppError("Credenciais inválidas", 401);
    const passwordMatch = await bcryptjs_1.default.compare(password, user.password);
    if (!passwordMatch)
        throw new appError_1.AppError("Credenciais inválidas", 401);
    const tokenPayload = {
        sub: user.id,
        accountType: "USER",
        role: user.role.role
    };
    const token = jsonwebtoken_1.default.sign(tokenPayload, env_1.env.JWT_SECRET, {
        expiresIn: "7d",
        algorithm: "HS256"
    });
    return {
        token
    };
};
exports.loginIn = loginIn;
