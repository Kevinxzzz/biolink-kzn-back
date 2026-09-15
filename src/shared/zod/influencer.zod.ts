import { z } from "zod";

export const createInfluencerZod = z.object({
    name: z.string().trim().min(1, "O nome é obrigatório").max(100, "O nome deve ter no máximo 100 caracteres"),
    slug: z.string().trim().min(1, "O slug é obrigatório").max(100, "O slug deve ter no máximo 100 caracteres").regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hifens"),
    email: z.string().trim().email("Formato de e-mail inválido").optional().nullable(),
    personalUrl: z.string().trim().url("Formato de URL inválido").max(255, "A URL deve ter no máximo 255 caracteres"),
    urlImgProfile: z.string().trim().url("Formato de URL da imagem inválido").optional().nullable(),
    imgKey: z.string().trim().optional().nullable()
}).strict();

export const updateInfluencerZod = z.object({
    name: z.string().trim().min(1, "O nome não pode ser vazio").max(100, "O nome deve ter no máximo 100 caracteres").optional(),
    slug: z.string().trim().min(1, "O slug não pode ser vazio").max(100, "O slug deve ter no máximo 100 caracteres").regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hifens").optional(),
    email: z.string().trim().email("Formato de e-mail inválido").optional().nullable(),
    personalUrl: z.string().trim().url("Formato de URL inválido").max(255, "A URL deve ter no máximo 255 caracteres").optional(),
    urlImgProfile: z.string().trim().url("Formato de URL da imagem inválido").optional().nullable(),
    imgKey: z.string().trim().optional().nullable()
}).strict();

export type CreateInfluencerInput = z.infer<typeof createInfluencerZod>;
export type UpdateInfluencerInput = z.infer<typeof updateInfluencerZod>;
