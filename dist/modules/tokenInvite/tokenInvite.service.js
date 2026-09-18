"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerViaToken = exports.validateToken = exports.deleteTokenInvite = exports.listTokenInvites = exports.createTokenInvite = void 0;
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../../shared/database/prisma");
const appError_1 = require("../../shared/errors/appError");
const auth_service_1 = require("../auth/auth.service");
const createTokenInvite = async (data, enterpriseId, createdById) => {
    const token = crypto_1.default.randomBytes(16).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + data.expiresInHours);
    const tokenInvite = await prisma_1.prisma.enterpriseTokenInvite.create({
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
exports.createTokenInvite = createTokenInvite;
const listTokenInvites = async (enterpriseId) => {
    const tokens = await prisma_1.prisma.enterpriseTokenInvite.findMany({
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
        }
        else if (token.maxUses !== null && uses >= token.maxUses) {
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
exports.listTokenInvites = listTokenInvites;
const deleteTokenInvite = async (id, enterpriseId) => {
    const tokenExists = await prisma_1.prisma.enterpriseTokenInvite.findUnique({
        where: { id }
    });
    if (!tokenExists) {
        throw new appError_1.AppError("Convite não encontrado.", 404);
    }
    if (tokenExists.enterpriseId !== enterpriseId) {
        throw new appError_1.AppError("Convite não encontrado.", 404); // Retorna 404 para não vazar a existência do token
    }
    await prisma_1.prisma.enterpriseTokenInvite.delete({
        where: { id }
    });
    return { message: "Convite excluído com sucesso." };
};
exports.deleteTokenInvite = deleteTokenInvite;
const validateToken = async (token, requestDomain) => {
    const application = await prisma_1.prisma.application.findUnique({
        where: { domain: requestDomain },
        include: { enterprise: true }
    });
    if (!application || !application.enterprise) {
        throw new appError_1.AppError("Aplicação não encontrada ou empresa não associada.", 404);
    }
    const tokenRecord = await prisma_1.prisma.enterpriseTokenInvite.findFirst({
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
        throw new appError_1.AppError("Convite inválido ou não encontrado.", 404);
    }
    if (new Date() > tokenRecord.expiresAt) {
        throw new appError_1.AppError("Este convite expirou.", 403);
    }
    if (tokenRecord.maxUses !== null && tokenRecord._count.userTokenInvites >= tokenRecord.maxUses) {
        throw new appError_1.AppError("Este convite atingiu o limite máximo de usos.", 403);
    }
    return {
        id: tokenRecord.id,
        enterpriseId: tokenRecord.enterpriseId,
        enterpriseName: application.enterprise.name,
        valid: true
    };
};
exports.validateToken = validateToken;
const registerViaToken = async (token, requestDomain, data) => {
    const application = await prisma_1.prisma.application.findUnique({
        where: { domain: requestDomain },
        include: { enterprise: true }
    });
    if (!application || !application.enterprise) {
        throw new appError_1.AppError("Aplicação não encontrada ou empresa não associada.", 404);
    }
    const enterpriseId = application.enterprise.id;
    const tokenRecord = await prisma_1.prisma.enterpriseTokenInvite.findFirst({
        where: { token, enterpriseId }
    });
    if (!tokenRecord) {
        throw new appError_1.AppError("Convite inválido ou não encontrado.", 404);
    }
    if (new Date() > tokenRecord.expiresAt) {
        throw new appError_1.AppError("Este convite expirou.", 403);
    }
    const hashedPassword = await (0, auth_service_1.createUserValidationAndHash)(data.email, data.password);
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        // Trava a linha do token concorrentemente
        await tx.$executeRaw `SELECT id FROM "enterprise_token_invite" WHERE id = ${tokenRecord.id}::uuid FOR UPDATE`;
        const currentUses = await tx.userTokenInvite.count({
            where: { tokenInviteId: tokenRecord.id }
        });
        if (tokenRecord.maxUses !== null && currentUses >= tokenRecord.maxUses) {
            throw new appError_1.AppError("Este convite atingiu o limite máximo de usos.", 403);
        }
        const roleAdmin = await tx.role.findFirst({
            where: { role: "ADMIN" }
        });
        if (!roleAdmin) {
            throw new appError_1.AppError("Internal Server Error", 500);
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
exports.registerViaToken = registerViaToken;
