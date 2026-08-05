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
            role: true
        }
    });

    if (!user) throw new AppError("Credenciais inválidas", 401);

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) throw new AppError("Credenciais inválidas", 401);

    const tokenPayload: import("../../shared/types/token").TokenPayload = {
        sub: user.id,
        accountType: "USER",
        role: user.role
    }

    const token = jwt.sign(tokenPayload, env.JWT_SECRET!, {
        expiresIn: "7d",
        algorithm: "HS256"
    });

    return {
        token
    }
};