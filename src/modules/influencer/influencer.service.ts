import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/appError";
import { CreateInfluencerInput, UpdateInfluencerInput } from "../../shared/zod/influencer.zod";

const handleUniqueConstraintError = (error: any) => {
    if (error.code === 'P2002' && error.meta?.target) {
        const target = error.meta.target;
        if (target.includes('slug')) {
            throw new AppError("Já existe um influenciador com este slug nesta empresa.", 409);
        }
        if (target.includes('email')) {
            throw new AppError("Já existe um influenciador com este e-mail nesta empresa.", 409);
        }
        if (target.includes('personal_url')) {
            throw new AppError("Já existe um influenciador com esta URL pessoal nesta empresa.", 409);
        }
        throw new AppError("Dados conflitantes com um registro existente.", 409);
    }
    throw error;
};

export const createInfluencer = async (enterpriseId: string, data: CreateInfluencerInput) => {
    try {
        const influencer = await prisma.influencer.create({
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
    } catch (error) {
        handleUniqueConstraintError(error);
    }
};

export const getInfluencers = async (enterpriseId: string) => {
    const influencers = await prisma.influencer.findMany({
        where: { enterpriseId },
        orderBy: { createAt: 'desc' }
    });
    return influencers;
};

export const getInfluencerById = async (id: string, enterpriseId: string) => {
    const influencer = await prisma.influencer.findFirst({
        where: { id, enterpriseId }
    });

    if (!influencer) {
        throw new AppError("Influenciador não encontrado ou acesso negado", 404);
    }

    return influencer;
};

export const updateInfluencer = async (id: string, enterpriseId: string, data: UpdateInfluencerInput) => {
    await getInfluencerById(id, enterpriseId); // Valida se existe e pertence ao tenant

    try {
        const influencer = await prisma.influencer.update({
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
    } catch (error) {
        handleUniqueConstraintError(error);
    }
};

export const deleteInfluencer = async (id: string, enterpriseId: string) => {
    await getInfluencerById(id, enterpriseId); // Valida se existe e pertence ao tenant

    await prisma.influencer.delete({
        where: { id }
    });
};

export const getPublicInfluencerBySlug = async (slug: string, domain: string) => {
    const app = await prisma.application.findUnique({
        where: { domain }
    });

    if (!app) {
        throw new AppError("Aplicação não encontrada para este domínio.", 403);
    }

    const influencer = await prisma.influencer.findFirst({
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
        throw new AppError("Influenciador não encontrado.", 404);
    }

    return influencer;
};
