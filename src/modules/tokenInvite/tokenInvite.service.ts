import crypto from "crypto";
import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/appError";
import { CreateTokenInviteInput, RegisterViaTokenInput } from "../../shared/zod/tokenInvite.zod";
import { createUserValidationAndHash } from "../auth/auth.service";

export const createTokenInvite = async (data: CreateTokenInviteInput, enterpriseId: string, createdById: string) => {
    const token = crypto.randomBytes(16).toString("hex");

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + data.expiresInHours);

    const tokenInvite = await prisma.enterpriseTokenInvite.create({
        data: {
            token,
            maxUses: data.maxUses ?? null,
            expiresAt,
            enterpriseId,
            createdById,
            createAt: new Date(),
            updateAt: new Date()
        }
    });

    return tokenInvite;
};

export const listTokenInvites = async (enterpriseId: string) => {
    const tokens = await prisma.enterpriseTokenInvite.findMany({
        where: { enterpriseId },
        include: {
            _count: {
                select: { userTokenInvites: true }
            }
        },
        orderBy: { createAt: "desc" }
    });

    const now = new Date();

    return tokens.map(token => {
        const uses = token._count.userTokenInvites;
        let status = "ATIVO";

        if (now > token.expiresAt) {
            status = "EXPIRADO";
        } else if (token.maxUses !== null && uses >= token.maxUses) {
            status = "ESGOTADO";
        }

        return {
            id: token.id,
            token: token.token,
            maxUses: token.maxUses,
            uses,
            status,
            createdAt: token.createAt,
            expiresAt: token.expiresAt
        };
    });
};

export const deleteTokenInvite = async (id: string, enterpriseId: string) => {
    const tokenExists = await prisma.enterpriseTokenInvite.findUnique({
        where: { id }
    });

    if (!tokenExists) {
        throw new AppError("Convite não encontrado.", 404);
    }

    if (tokenExists.enterpriseId !== enterpriseId) {
        throw new AppError("Convite não encontrado.", 404); // Retorna 404 para não vazar a existência do token
    }

    await prisma.enterpriseTokenInvite.delete({
        where: { id }
    });

    return { message: "Convite excluído com sucesso." };
};

export const validateToken = async (token: string, requestDomain: string) => {
    const application = await prisma.application.findUnique({
        where: { domain: requestDomain },
        include: { enterprise: true }
    });

    if (!application || !application.enterprise) {
        throw new AppError("Aplicação não encontrada ou empresa não associada.", 404);
    }

    const tokenRecord = await prisma.enterpriseTokenInvite.findFirst({
        where: { 
            token, 
            enterpriseId: application.enterprise.id 
        },
        include: {
            _count: {
                select: { userTokenInvites: true }
            }
        }
    });

    if (!tokenRecord) {
        throw new AppError("Convite inválido ou não encontrado.", 404);
    }

    if (new Date() > tokenRecord.expiresAt) {
        throw new AppError("Este convite expirou.", 403);
    }

    if (tokenRecord.maxUses !== null && tokenRecord._count.userTokenInvites >= tokenRecord.maxUses) {
        throw new AppError("Este convite atingiu o limite máximo de usos.", 403);
    }

    return {
        id: tokenRecord.id,
        enterpriseId: tokenRecord.enterpriseId,
        enterpriseName: application.enterprise.name,
        valid: true
    };
};

export const registerViaToken = async (token: string, requestDomain: string, data: RegisterViaTokenInput) => {
    const application = await prisma.application.findUnique({
        where: { domain: requestDomain },
        include: { enterprise: true }
    });

    if (!application || !application.enterprise) {
        throw new AppError("Aplicação não encontrada ou empresa não associada.", 404);
    }

    const enterpriseId = application.enterprise.id;

    const tokenRecord = await prisma.enterpriseTokenInvite.findFirst({
        where: { token, enterpriseId }
    });

    if (!tokenRecord) {
        throw new AppError("Convite inválido ou não encontrado.", 404);
    }

    if (new Date() > tokenRecord.expiresAt) {
        throw new AppError("Este convite expirou.", 403);
    }

    const hashedPassword = await createUserValidationAndHash(data.email, data.password);

    const result = await prisma.$transaction(async (tx) => {
        // Trava a linha do token concorrentemente
        await tx.$executeRaw`SELECT id FROM "enterprise_token_invite" WHERE id = ${tokenRecord.id}::uuid FOR UPDATE`;

        const currentUses = await tx.userTokenInvite.count({
            where: { tokenInviteId: tokenRecord.id }
        });

        if (tokenRecord.maxUses !== null && currentUses >= tokenRecord.maxUses) {
            throw new AppError("Este convite atingiu o limite máximo de usos.", 403);
        }

        const roleAdmin = await tx.role.findFirst({
            where: { role: "ADMIN" }
        });

        if (!roleAdmin) {
            throw new AppError("Internal Server Error", 500);
        }

        // Criando usuário de fato
        const newUser = await tx.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: hashedPassword,
                enterpriseId: enterpriseId,
                roleId: roleAdmin.id,
                createAt: new Date(),
                updateAt: new Date()
            }
        });

        // Registrando uso do token
        await tx.userTokenInvite.create({
            data: {
                usedBy: newUser.id,
                tokenInviteId: tokenRecord.id,
                usedAt: new Date()
            }
        });

        return { userId: newUser.id, enterpriseId };
    });

    return {
        message: "Usuário cadastrado com sucesso",
        data: result
    };
};
