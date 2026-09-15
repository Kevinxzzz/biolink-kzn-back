"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicInfluencerBySlug = exports.deleteInfluencer = exports.updateInfluencer = exports.getInfluencerById = exports.getInfluencers = exports.createInfluencer = void 0;
const prisma_1 = require("../../shared/database/prisma");
const appError_1 = require("../../shared/errors/appError");
const handleUniqueConstraintError = (error) => {
    if (error.code === 'P2002' && error.meta?.target) {
        const target = error.meta.target;
        if (target.includes('slug')) {
            throw new appError_1.AppError("Já existe um influenciador com este slug nesta empresa.", 409);
        }
        if (target.includes('email')) {
            throw new appError_1.AppError("Já existe um influenciador com este e-mail nesta empresa.", 409);
        }
        if (target.includes('personal_url')) {
            throw new appError_1.AppError("Já existe um influenciador com esta URL pessoal nesta empresa.", 409);
        }
        throw new appError_1.AppError("Dados conflitantes com um registro existente.", 409);
    }
    throw error;
};
const createInfluencer = async (enterpriseId, data) => {
    try {
        const influencer = await prisma_1.prisma.influencer.create({
            data: {
                name: data.name,
                slug: data.slug,
                email: data.email,
                personalUrl: data.personalUrl,
                urlImgProfile: data.urlImgProfile,
                imgKey: data.imgKey,
                counterEntries: 0,
                enterpriseId: enterpriseId,
                createAt: new Date(),
                updateAt: new Date(),
            }
        });
        return influencer;
    }
    catch (error) {
        handleUniqueConstraintError(error);
    }
};
exports.createInfluencer = createInfluencer;
const getInfluencers = async (enterpriseId) => {
    const influencers = await prisma_1.prisma.influencer.findMany({
        where: { enterpriseId },
        orderBy: { createAt: 'desc' }
    });
    return influencers;
};
exports.getInfluencers = getInfluencers;
const getInfluencerById = async (id, enterpriseId) => {
    const influencer = await prisma_1.prisma.influencer.findFirst({
        where: { id, enterpriseId }
    });
    if (!influencer) {
        throw new appError_1.AppError("Influenciador não encontrado ou acesso negado", 404);
    }
    return influencer;
};
exports.getInfluencerById = getInfluencerById;
const updateInfluencer = async (id, enterpriseId, data) => {
    await (0, exports.getInfluencerById)(id, enterpriseId); // Valida se existe e pertence ao tenant
    try {
        const influencer = await prisma_1.prisma.influencer.update({
            where: { id },
            data: {
                name: data.name,
                slug: data.slug,
                email: data.email,
                personalUrl: data.personalUrl,
                urlImgProfile: data.urlImgProfile,
                imgKey: data.imgKey,
                updateAt: new Date(),
            }
        });
        return influencer;
    }
    catch (error) {
        handleUniqueConstraintError(error);
    }
};
exports.updateInfluencer = updateInfluencer;
const deleteInfluencer = async (id, enterpriseId) => {
    await (0, exports.getInfluencerById)(id, enterpriseId); // Valida se existe e pertence ao tenant
    await prisma_1.prisma.influencer.delete({
        where: { id }
    });
};
exports.deleteInfluencer = deleteInfluencer;
const getPublicInfluencerBySlug = async (slug, domain) => {
    const app = await prisma_1.prisma.application.findUnique({
        where: { domain }
    });
    if (!app) {
        throw new appError_1.AppError("Aplicação não encontrada para este domínio.", 403);
    }
    const influencer = await prisma_1.prisma.influencer.findFirst({
        where: {
            slug,
            enterprise: {
                applicationId: app.id
            }
        },
        select: {
            id: true,
            name: true,
            slug: true,
            personalUrl: true,
            urlImgProfile: true,
            imgKey: true
        }
    });
    if (!influencer) {
        throw new appError_1.AppError("Influenciador não encontrado.", 404);
    }
    return influencer;
};
exports.getPublicInfluencerBySlug = getPublicInfluencerBySlug;
