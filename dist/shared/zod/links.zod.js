"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reorderLinksZod = exports.updateLinkZod = exports.createLinkZod = void 0;
const zod_1 = require("zod");
exports.createLinkZod = zod_1.z.object({
    title: zod_1.z.string().trim().min(1, "O título é obrigatório").max(100, "O título deve ter no máximo 100 caracteres"),
    url: zod_1.z.string().trim().url("A URL deve ser válida").max(500, "A URL deve ter no máximo 500 caracteres"),
    categoryId: zod_1.z.string().uuid("O ID da categoria deve ser um UUID válido"),
});
exports.updateLinkZod = zod_1.z.object({
    title: zod_1.z.string().trim().min(1, "O título não pode ser vazio").max(100, "O título deve ter no máximo 100 caracteres").optional(),
    url: zod_1.z.string().trim().url("A URL deve ser válida").max(500, "A URL deve ter no máximo 500 caracteres").optional(),
}).strict();
exports.reorderLinksZod = zod_1.z.object({
    categoryId: zod_1.z.string().uuid("O ID da categoria deve ser um UUID válido"),
    links: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().uuid("ID inválido"),
        order: zod_1.z.number().int().positive("A ordem deve ser um número positivo"),
    })).min(1, "Deve ser enviada pelo menos uma ordem de link")
});
