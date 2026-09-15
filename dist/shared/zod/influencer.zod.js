"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateInfluencerZod = exports.createInfluencerZod = void 0;
const zod_1 = require("zod");
exports.createInfluencerZod = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, "O nome é obrigatório").max(100, "O nome deve ter no máximo 100 caracteres"),
    slug: zod_1.z.string().trim().min(1, "O slug é obrigatório").max(100, "O slug deve ter no máximo 100 caracteres").regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hifens"),
    email: zod_1.z.string().trim().email("Formato de e-mail inválido").optional().nullable(),
    personalUrl: zod_1.z.string().trim().url("Formato de URL inválido").max(255, "A URL deve ter no máximo 255 caracteres"),
    urlImgProfile: zod_1.z.string().trim().url("Formato de URL da imagem inválido").optional().nullable(),
    imgKey: zod_1.z.string().trim().optional().nullable()
}).strict();
exports.updateInfluencerZod = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, "O nome não pode ser vazio").max(100, "O nome deve ter no máximo 100 caracteres").optional(),
    slug: zod_1.z.string().trim().min(1, "O slug não pode ser vazio").max(100, "O slug deve ter no máximo 100 caracteres").regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hifens").optional(),
    email: zod_1.z.string().trim().email("Formato de e-mail inválido").optional().nullable(),
    personalUrl: zod_1.z.string().trim().url("Formato de URL inválido").max(255, "A URL deve ter no máximo 255 caracteres").optional(),
    urlImgProfile: zod_1.z.string().trim().url("Formato de URL da imagem inválido").optional().nullable(),
    imgKey: zod_1.z.string().trim().optional().nullable()
}).strict();
