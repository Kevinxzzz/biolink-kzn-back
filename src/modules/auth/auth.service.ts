import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../shared/config/env";
import { prisma } from "../../shared/database/prisma";
import { LoginInput } from "../../shared/types/auth.type"
import { AppError } from "../../shared/errors/appError";

export const loginIn = async ({ email, password }: LoginInput) => {
    const user = await prisma.user.findFirst({
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

    if (!user) throw new AppError("Credenciais inválidas", 401);

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) throw new AppError("Credenciais inválidas", 401);

    const tokenPayload: import("../../shared/types/token").TokenPayload = {
        sub: user.id,
        accountType: "USER",
        role: user.role.role
    }

    const token = jwt.sign(tokenPayload, env.JWT_SECRET!, {
        expiresIn: "7d",
        algorithm: "HS256"
    });

    return {
        token
    }
};

export const registerEnterprise = async (data: import("../../shared/types/auth.type").RegisterEnterpriseInput) => {
    try {
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
        if (error.code === 'P2002') {
            throw new AppError("Dados já cadastrados (email ou telefone)", 409);
        }
        throw error;
    }
};