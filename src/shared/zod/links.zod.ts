import { z } from "zod";

export const createLinkZod = z.object({
    title: z.string().trim().min(1, "O título é obrigatório").max(100, "O título deve ter no máximo 100 caracteres"),
    url: z.string().trim().url("A URL deve ser válida").max(500, "A URL deve ter no máximo 500 caracteres"),
    //categoryId: z.string().uuid("O ID da categoria deve ser um UUID válido"),
});

export const updateLinkZod = z.object({
    title: z.string().trim().min(1, "O título não pode ser vazio").max(100, "O título deve ter no máximo 100 caracteres").optional(),
    url: z.string().trim().url("A URL deve ser válida").max(500, "A URL deve ter no máximo 500 caracteres").optional(),
}).strict();

export const reorderLinksZod = z.object({
    categoryId: z.string().uuid("O ID da categoria deve ser um UUID válido"),
    links: z.array(
        z.object({
            id: z.string().uuid("ID inválido"),
            order: z.number().int().positive("A ordem deve ser um número positivo"),
        })
    ).min(1, "Deve ser enviada pelo menos uma ordem de link")
});

export type CreateLinkInput = z.infer<typeof createLinkZod>;
export type UpdateLinkInput = z.infer<typeof updateLinkZod>;
export type ReorderLinksInput = z.infer<typeof reorderLinksZod>;
