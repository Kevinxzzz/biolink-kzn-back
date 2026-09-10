"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthenticatedUser = exports.registerEnterprise = exports.loginIn = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../../shared/config/env");
const prisma_1 = require("../../shared/database/prisma");
const appError_1 = require("../../shared/errors/appError");
const loginIn = async ({ email, password }, requestDomain) => {
    if (!requestDomain) {
        throw new appError_1.AppError("Aplicação não identificada.", 403);
    }
    let application = await prisma_1.prisma.application.findUnique({
        where: { domain: requestDomain }
    });
    if (!application) {
        throw new appError_1.AppError("Aplicação não encontrada ou não autorizada.", 403);
    }
    const user = await prisma_1.prisma.user.findFirst({
        where: {
            email: email,
            enterprise: {
                applicationId: application.id
            }
        },
        select: {
            id: true,
            name: true,
            email: true,
            password: true,
            enterpriseId: true,
            enterprise: {
                select: {
                    applicationId: true
                }
            },
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
    if (!user.enterprise?.applicationId || user.enterprise.applicationId !== application.id) {
        throw new appError_1.AppError("Acesso não permitido para esta aplicação.", 403);
    }
    const tokenPayload = {
        sub: user.id,
        accountType: "USER",
        role: user.role.role,
        applicationId: application.id
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
const registerEnterprise = async (data, requestDomain) => {
    try {
        if (!requestDomain) {
            throw new appError_1.AppError("Aplicação não identificada.", 403);
        }
        let application = await prisma_1.prisma.application.findUnique({
            where: { domain: requestDomain }
        });
        if (!application) {
            throw new appError_1.AppError("Aplicação não encontrada ou não autorizada.", 403);
        }
        const countEnterprise = (await prisma_1.prisma.enterprise.findMany()).length;
        if (countEnterprise > 2)
            throw new appError_1.AppError("Limite de empresas cadastradas já excedido.", 409);
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
                    applicationId: application.id,
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
const getAuthenticatedUser = async (user) => {
    if (user.accountType === "USER") {
        const userFound = await prisma_1.prisma.user.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                name: true,
                email: true,
                role: {
                    select: {
                        role: true
                    }
                },
                enterprise: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phoneNumber: true,
                        application: {
                            select: {
                                id: true,
                                name: true,
                                domain: true
                            }
                        }
                    }
                }
            }
        });
        if (!userFound) {
            throw new appError_1.AppError("Usuário não encontrado.", 404);
        }
        return {
            id: userFound.id,
            name: userFound.name,
            email: userFound.email,
            accountType: "USER",
            role: userFound.role.role,
            enterprise: userFound.enterprise ? {
                name: userFound.enterprise.name,
                email: userFound.enterprise.email,
                phoneNumber: userFound.enterprise.phoneNumber
            } : null,
            application: userFound.enterprise?.application ? {
                name: userFound.enterprise.application.name,
                domain: userFound.enterprise.application.domain
            } : null
        };
    }
    else {
        const influencerFound = await prisma_1.prisma.influencer.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                name: true,
                slug: true,
                email: true,
                personalUrl: true,
                urlImgProfile: true,
                enterprise: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phoneNumber: true,
                        application: {
                            select: {
                                id: true,
                                name: true,
                                domain: true
                            }
                        }
                    }
                }
            }
        });
        if (!influencerFound) {
            throw new appError_1.AppError("Influenciador não encontrado.", 404);
        }
        return {
            id: influencerFound.id,
            name: influencerFound.name,
            slug: influencerFound.slug,
            email: influencerFound.email,
            personalUrl: influencerFound.personalUrl,
            urlImgProfile: influencerFound.urlImgProfile,
            accountType: "INFLUENCER",
            enterprise: influencerFound.enterprise ? {
                name: influencerFound.enterprise.name,
                email: influencerFound.enterprise.email,
                phoneNumber: influencerFound.enterprise.phoneNumber
            } : null,
            application: influencerFound.enterprise?.application ? {
                name: influencerFound.enterprise.application.name,
                domain: influencerFound.enterprise.application.domain
            } : null
        };
    }
};
exports.getAuthenticatedUser = getAuthenticatedUser;
