import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../database/prisma";
import { AppError } from "../errors/appError";
import type { TokenPayload, AuthenticatedUser } from "../types/token";
import { extractDomain } from "../utils/domain";

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers?.authorization;

        if (!authHeader) {
            throw new AppError("Token não fornecido", 401);
        }

        const [, token] = authHeader.split(" ");

        if (!token) {
            throw new AppError("Token inválido", 401);
        }

        let payload: TokenPayload;
        try {
            payload = jwt.verify(token, env.JWT_SECRET!, {
                algorithms: ["HS256"]
            }) as TokenPayload;
        } catch (error) {
            throw new AppError("Token expirado ou inválido", 401);
        }

        if (payload.accountType !== "USER" && payload.accountType !== "INFLUENCER") {
            throw new AppError("Token inválido", 401);
        }

        const requestDomain = extractDomain(req);
        if (!requestDomain) {
            throw new AppError("Aplicação não identificada.", 403);
        }

        let currentApp = await prisma.application.findUnique({
            where: { domain: requestDomain }
        });

        if (!currentApp) {
            throw new AppError("Aplicação não encontrada ou não autorizada.", 403);
        }

        if (!payload.applicationId || payload.applicationId !== currentApp.id) {
            throw new AppError("Acesso não permitido para esta aplicação.", 403);
        }

        let userRecord: AuthenticatedUser | null = null;

        if (payload.accountType === "USER") {
            const user = await prisma.user.findUnique({
                where: { id: payload.sub },
                select: {
                    id: true,
                    email: true,
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

            if (user) {
                if (!user.enterprise?.applicationId || user.enterprise.applicationId !== currentApp.id) {
                    throw new AppError("Acesso não permitido para esta aplicação.", 403);
                }

                userRecord = {
                    id: user.id,
                    email: user.email,
                    enterpriseId: user.enterpriseId,
                    applicationId: user.enterprise.applicationId,
                    accountType: "USER",
                    role: user.role.role
                };
            }
        } else if (payload.accountType === "INFLUENCER") {
            const influencer = await prisma.influencer.findUnique({
                where: { id: payload.sub },
                select: {
                    id: true,
                    email: true,
                    enterpriseId: true,
                    enterprise: {
                        select: {
                            applicationId: true
                        }
                    }
                }
            });

            if (influencer) {
                if (!influencer.enterprise?.applicationId || influencer.enterprise.applicationId !== currentApp.id) {
                    throw new AppError("Acesso não permitido para esta aplicação.", 403);
                }

                userRecord = {
                    id: influencer.id,
                    email: influencer.email,
                    enterpriseId: influencer.enterpriseId,
                    applicationId: influencer.enterprise.applicationId,
                    accountType: "INFLUENCER"
                };
            }
        }

        if (!userRecord) {
            throw new AppError("Usuário não encontrado", 401);
        }

        req.user = userRecord;
        return next();
    } catch (error) {
        return next(error);
    }
};
