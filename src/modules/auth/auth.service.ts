import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../shared/config/env";
import { prisma } from "../../shared/database/prisma";
import { LoginInput } from "../../shared/types/auth.type"
import { AppError } from "../../shared/errors/appError";

export const loginIn = async ({ email, password }: LoginInput, requestDomain?: string | null) => {
    if (!requestDomain) {
        throw new AppError("Aplicação não identificada.", 403);
    }

    let application = await prisma.application.findUnique({
        where: { domain: requestDomain }
    });

    if (!application) {
        throw new AppError("Aplicação não encontrada ou não autorizada.", 403);
    }

    const user = await prisma.user.findFirst({
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

    if (!user) throw new AppError("E-mail ou senha inválidos.", 401);

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) throw new AppError("E-mail ou senha inválidos.", 401);

    if (!user.enterprise?.applicationId || user.enterprise.applicationId !== application.id) {
        throw new AppError("Acesso não permitido para esta aplicação.", 403);
    }

    const tokenPayload: import("../../shared/types/token").TokenPayload = {
        sub: user.id,
        accountType: "USER",
        role: user.role.role,
        applicationId: application.id
    };

    const token = jwt.sign(tokenPayload, env.JWT_SECRET!, {
        expiresIn: "7d",
        algorithm: "HS256"
    });

    return {
        token
    };
};

export const registerEnterprise = async (data: import("../../shared/types/auth.type").RegisterEnterpriseInput, requestDomain?: string | null) => {
    try {
        if (!requestDomain) {
            throw new AppError("Aplicação não identificada.", 403);
        }

        let application = await prisma.application.findUnique({
            where: { domain: requestDomain }
        });

        if (!application) {
            throw new AppError("Aplicação não encontrada ou não autorizada.", 403);
        }

        const countEnterprise = (await prisma.enterprise.findMany()).length
        if (countEnterprise > 2) throw new AppError("Limite de empresas cadastradas já excedido.", 409);

        const existingCompanyEmail = await prisma.enterprise.findFirst({ where: { email: data.company.email } });
        if (existingCompanyEmail) throw new AppError("E-mail da empresa já cadastrado.", 409);

        const existingCompanyPhone = await prisma.enterprise.findFirst({ where: { phoneNumber: data.company.phone } });
        if (existingCompanyPhone) throw new AppError("Telefone da empresa já cadastrado.", 409);

        const existingUserEmail = await prisma.user.findFirst({ where: { email: data.user.email } });
        if (existingUserEmail) throw new AppError("O e-mail informado para o usuário já está cadastrado.", 409);

        const hashedPassword = await bcrypt.hash(data.user.password, 10);

        const result = await prisma.$transaction(async (tx) => {
            const roleOwner = await tx.role.findFirst({
                where: { role: "OWNER" }
            });

            if (!roleOwner) {
                throw new AppError("Internal Server Error", 500);
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
    } catch (error: any) {
        if (error instanceof AppError) throw error;

        if (error.code === 'P2002') {
            throw new AppError("Dados já cadastrados no sistema.", 409);
        }
        throw error;
    }
};

export const getAuthenticatedUser = async (user: import("../../shared/types/token").AuthenticatedUser) => {
    if (user.accountType === "USER") {
        const userFound = await prisma.user.findUnique({
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
            throw new AppError("Usuário não encontrado.", 404);
        }

        return {
            id: userFound.id,
            name: userFound.name,
            email: userFound.email,
            accountType: "USER" as const,
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
    } else {
        const influencerFound = await prisma.influencer.findUnique({
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
            throw new AppError("Influenciador não encontrado.", 404);
        }

        return {
            id: influencerFound.id,
            name: influencerFound.name,
            slug: influencerFound.slug,
            email: influencerFound.email,
            personalUrl: influencerFound.personalUrl,
            urlImgProfile: influencerFound.urlImgProfile,
            accountType: "INFLUENCER" as const,
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