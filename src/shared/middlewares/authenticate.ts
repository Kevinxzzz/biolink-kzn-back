import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../database/prisma";
import { AppError } from "../errors/appError";
import type { TokenPayload, AuthenticatedUser } from "../types/token";
import { extractDomain } from "../utils/domain";

/**
 * Tenta resolver e validar as credenciais de um token JWT presente na requisição.
 *
 * Realiza todas as validações completas: assinatura JWT, accountType, tenant (applicationId,
 * enterpriseId) e existência do usuário no banco de dados.
 *
 * @param token - String bruta do JWT a ser verificado.
 * @param requestDomain - Domínio extraído da requisição, usado para validação de tenant.
 * @returns `AuthenticatedUser` se o token for válido e o usuário existir, ou `null` caso
 *          o token esteja ausente. Lança `AppError` se o token for inválido ou o tenant
 *          não corresponder.
 */
export async function resolveUserAuth(token: string, requestDomain: string | null): Promise<AuthenticatedUser | null> {
    let payload: TokenPayload;
    try {
        payload = jwt.verify(token, env.JWT_SECRET!, {
            algorithms: ["HS256"]
        }) as TokenPayload;
    } catch {
        throw new AppError("Token expirado ou inválido", 401);
    }

    if (payload.accountType !== "USER" && payload.accountType !== "INFLUENCER") {
        throw new AppError("Token inválido", 401);
    }

    if (!requestDomain) {
        throw new AppError("Aplicação não identificada.", 403);
    }

    const currentApp = await prisma.application.findUnique({
        where: { domain: requestDomain }
    });

    if (!currentApp) {
        throw new AppError("Aplicação não encontrada ou não autorizada.", 403);
    }

    if (!payload.applicationId || payload.applicationId !== currentApp.id) {
        throw new AppError("Acesso não permitido para esta aplicação.", 403);
    }

    if (payload.accountType === "USER") {
        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
                id: true,
                email: true,
                enterpriseId: true,
                enterprise: { select: { applicationId: true } },
                role: { select: { role: true } }
            }
        });

        if (!user) throw new AppError("Usuário não encontrado", 401);

        if (!user.enterprise?.applicationId || user.enterprise.applicationId !== currentApp.id) {
            throw new AppError("Acesso não permitido para esta aplicação.", 403);
        }

        return {
            id: user.id,
            email: user.email,
            enterpriseId: user.enterpriseId,
            applicationId: user.enterprise.applicationId,
            accountType: "USER",
            role: user.role.role
        };
    }

    // accountType === "INFLUENCER"
    const influencer = await prisma.influencer.findUnique({
        where: { id: payload.sub },
        select: {
            id: true,
            email: true,
            enterpriseId: true,
            enterprise: { select: { applicationId: true } }
        }
    });

    if (!influencer) throw new AppError("Usuário não encontrado", 401);

    if (!influencer.enterprise?.applicationId || influencer.enterprise.applicationId !== currentApp.id) {
        throw new AppError("Acesso não permitido para esta aplicação.", 403);
    }

    return {
        id: influencer.id,
        email: influencer.email || "",
        enterpriseId: influencer.enterpriseId,
        applicationId: influencer.enterprise.applicationId,
        accountType: "INFLUENCER"
    };
}

/**
 * Middleware de autenticação para rotas protegidas.
 * Exige o token JWT no header Authorization: Bearer <token>.
 * Lança 401/403 se as credenciais forem inválidas ou o tenant não corresponder.
 */
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

        const requestDomain = extractDomain(req);
        const userRecord = await resolveUserAuth(token, requestDomain);

        if (!userRecord) {
            throw new AppError("Usuário não encontrado", 401);
        }

        req.user = userRecord;
        return next();
    } catch (error) {
        return next(error);
    }
};
