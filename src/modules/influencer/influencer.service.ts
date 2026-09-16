import { prisma } from "../../shared/database/prisma";
import { redis } from "../../shared/database/redis";
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
const influencerSelect = {
    id: true,
    name: true,
    slug: true,
    email: true,
    counterEntries: true,
    personalUrl: true,
    urlImgProfile: true,
    imgKey: true
};

export const createInfluencer = async (enterpriseId: string, data: CreateInfluencerInput, baseUrl: string) => {
    const existingInfluencer = await prisma.influencer.findFirst({
        where: { slug: data.slug, enterpriseId }
    });

    if (existingInfluencer) {
        throw new AppError("Já existe um influenciador com este slug nesta empresa.", 409);
    }

    if (data.email) {
        const existingEmail = await prisma.influencer.findFirst({
            where: { email: data.email, enterpriseId }
        });

        if (existingEmail) {
            throw new AppError("Já existe um influenciador com este e-mail nesta empresa.", 409);
        }
    }

    try {
        const personalUrl = `${baseUrl}/${data.slug}`;

        const influencer = await prisma.influencer.create({
            data: {
                name: data.name,
                slug: data.slug,
                email: data.email,
                personalUrl: personalUrl,
                urlImgProfile: data.urlImgProfile,
                imgKey: data.imgKey,
                counterEntries: 0,
                enterpriseId: enterpriseId,
                createAt: new Date(),
                updateAt: new Date(),
            },
            select: influencerSelect
        });
        return influencer;
    } catch (error) {
        handleUniqueConstraintError(error);
    }
};

export const getInfluencers = async (enterpriseId: string) => {
    const influencers = await prisma.influencer.findMany({
        where: { enterpriseId },
        orderBy: { createAt: 'desc' },
        select: influencerSelect
    });

    if (influencers.length === 0) {
        return influencers;
    }

    try {
        const pipeline = redis.pipeline();
        influencers.forEach(influencer => {
            pipeline.get(`influencer_clicks:${enterpriseId}:${influencer.id}`);
        });

        const results = await pipeline.exec();

        if (results) {
            influencers.forEach((influencer, index) => {
                const [err, redisClicks] = results[index];
                if (!err && redisClicks) {
                    influencer.counterEntries += parseInt(redisClicks as string, 10);
                }
            });
        }
    } catch (error) {
        console.error("Erro ao buscar cliques no Redis para influenciadores:", error);
    }

    return influencers;
};

export const getInfluencerById = async (id: string, enterpriseId: string) => {
    const influencer = await prisma.influencer.findFirst({
        where: { id, enterpriseId },
        select: influencerSelect
    });

    if (!influencer) {
        throw new AppError("Influenciador não encontrado ou acesso negado", 404);
    }

    try {
        const redisClicks = await redis.get(`influencer_clicks:${enterpriseId}:${influencer.id}`);
        if (redisClicks) {
            influencer.counterEntries += parseInt(redisClicks, 10);
        }
    } catch (error) {
        console.error(`Erro ao buscar cliques no Redis para influenciador ${id}:`, error);
    }

    return influencer;
};

export const updateInfluencer = async (id: string, enterpriseId: string, data: UpdateInfluencerInput, baseUrl: string) => {
    const currentInfluencer = await getInfluencerById(id, enterpriseId); // Valida se existe e pertence ao tenant

    if (data.slug && data.slug !== currentInfluencer.slug) {
        const existingInfluencer = await prisma.influencer.findFirst({
            where: {
                slug: data.slug,
                enterpriseId,
                id: { not: id }
            }
        });

        if (existingInfluencer && existingInfluencer.id !== id) {
            throw new AppError("Já existe um influenciador com este slug nesta empresa.", 409);
        }
    }

    if (data.email && data.email !== currentInfluencer.email) {
        const existingEmail = await prisma.influencer.findFirst({
            where: {
                email: data.email,
                enterpriseId,
                id: { not: id }
            }
        });

        if (existingEmail && existingEmail.id !== id) {
            throw new AppError("Já existe um influenciador com este e-mail nesta empresa.", 409);
        }
    }

    try {
        const personalUrl = data.slug ? `${baseUrl}/${data.slug}` : currentInfluencer.personalUrl;

        const influencer = await prisma.influencer.update({
            where: { id },
            data: {
                name: data.name,
                slug: data.slug,
                email: data.email,
                personalUrl: personalUrl,
                urlImgProfile: data.urlImgProfile,
                imgKey: data.imgKey,
                updateAt: new Date(),
            },
            select: influencerSelect
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
    if (!slug || typeof slug !== "string" || slug.trim() === "") {
        throw new AppError("Slug inválido ou não informado.", 400);
    }

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
