"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEnterprise = exports.loginIn = void 0;
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
        throw new appError_1.AppError("E-mail ou senha inválidos.", 401);
    const passwordMatch = await bcryptjs_1.default.compare(password, user.password);
    if (!passwordMatch)
        throw new appError_1.AppError("E-mail ou senha inválidos.", 401);
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
const registerEnterprise = async (data) => {
    try {
        const existingCompanyEmail = await prisma_1.prisma.enterprise.findFirst({ where: { email: data.company.email } });
        if (existingCompanyEmail)
            throw new appError_1.AppError("E-mail da empresa já cadastrado.", 409);
        const existingCompanyPhone = await prisma_1.prisma.enterprise.findFirst({ where: { phoneNumber: data.company.phone } });
        if (existingCompanyPhone)
            throw new appError_1.AppError("Telefone da empresa já cadastrado.", 409);
        const existingUserEmail = await prisma_1.prisma.user.findFirst({ where: { email: data.user.email } });
        if (existingUserEmail)
            throw new appError_1.AppError("O e-mail informado para o usuário já está cadastrado.", 409);
        const hashedPassword = await bcryptjs_1.default.hash(data.user.password, 10);
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            const roleOwner = await tx.role.findFirst({
                where: { role: "OWNER" }
            });
            if (!roleOwner) {
                throw new appError_1.AppError("Internal Server Error", 500);
            }
            const newEnterprise = await tx.enterprise.create({
                data: {
                    name: data.company.name,
                    email: data.company.email,
                    phoneNumber: data.company.phone,
                    createAt: new Date(),
                    updateAt: new Date(),
                }
            });
            const newUser = await tx.user.create({
                data: {
                    name: data.user.name,
                    email: data.user.email,
                    password: hashedPassword,
                    enterpriseId: newEnterprise.id,
                    roleId: roleOwner.id,
                    createAt: new Date(),
                    updateAt: new Date(),
                }
            });
            return { enterpriseId: newEnterprise.id, userId: newUser.id };
        });
        return {
            message: "Empresa criada com sucesso",
            data: result
        };
    }
    catch (error) {
        if (error instanceof appError_1.AppError)
            throw error;
        if (error.code === 'P2002') {
            throw new appError_1.AppError("Dados já cadastrados no sistema.", 409);
        }
        throw error;
    }
};
exports.registerEnterprise = registerEnterprise;
