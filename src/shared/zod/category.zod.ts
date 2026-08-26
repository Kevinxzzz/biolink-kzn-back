import { z } from "zod";
import { ToggleType } from "@prisma/client";

export const createCategoryZod = z.object({
    name: z.string().trim().min(1, "O nome é obrigatório").max(100, "O nome deve ter no máximo 100 caracteres")
}).strict();

export const updateCategoryZod = z.object({
    name: z.string().trim().min(1, "O nome não pode ser vazio").max(100, "O nome deve ter no máximo 100 caracteres")
}).strict();

export const updateCategoryRotationZod = z.object({
    toggleType: z.nativeEnum(ToggleType),
    limitClicks: z.number().int().positive().nullable().optional(),
    timerInMinutes: z.number().int().positive().nullable().optional(),
}).strict().superRefine((data, ctx) => {
    const isLimitNull = data.limitClicks === undefined || data.limitClicks === null;
    const isTimerNull = data.timerInMinutes === undefined || data.timerInMinutes === null;

    if (data.toggleType === "LIMITCLICKS" && isLimitNull) {
        ctx.addIssue({ 
            code: z.ZodIssueCode.custom, 
            message: "limitClicks é obrigatório para LIMITCLICKS", 
            path: ["limitClicks"] 
        });
    }
    if (data.toggleType === "TIMER" && isTimerNull) {
        ctx.addIssue({ 
            code: z.ZodIssueCode.custom, 
            message: "timerInMinutes é obrigatório para TIMER", 
            path: ["timerInMinutes"] 
        });
    }
});

export type CreateCategoryInput = z.infer<typeof createCategoryZod>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryZod>;
export type UpdateCategoryRotationInput = z.infer<typeof updateCategoryRotationZod>;

