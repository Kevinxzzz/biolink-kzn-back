import { z } from "zod";

export const createCategoryZod = z.object({
    name: z.string().trim().min(1, "O nome é obrigatório").max(100, "O nome deve ter no máximo 100 caracteres")
}).strict();

export const updateCategoryZod = z.object({
    name: z.string().trim().min(1, "O nome não pode ser vazio").max(100, "O nome deve ter no máximo 100 caracteres")
}).strict();

export type CreateCategoryInput = z.infer<typeof createCategoryZod>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryZod>;
