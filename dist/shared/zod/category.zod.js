"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCategoryRotationZod = exports.updateCategoryZod = exports.createCategoryZod = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
exports.createCategoryZod = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, "O nome é obrigatório").max(100, "O nome deve ter no máximo 100 caracteres")
}).strict();
exports.updateCategoryZod = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, "O nome não pode ser vazio").max(100, "O nome deve ter no máximo 100 caracteres")
}).strict();
exports.updateCategoryRotationZod = zod_1.z.object({
    toggleType: zod_1.z.nativeEnum(client_1.ToggleType),
    limitClicks: zod_1.z.number().int("O limite deve ser um número inteiro").positive("O limite de cliques deve ser maior que zero").optional().nullable(),
    timerInMinutes: zod_1.z.number().int("O tempo deve ser um número inteiro").positive("O tempo deve ser maior que zero").optional().nullable(),
}).strict().superRefine((data, ctx) => {
    const isLimitNull = data.limitClicks === undefined || data.limitClicks === null;
    const isTimerNull = data.timerInMinutes === undefined || data.timerInMinutes === null;
    if (data.toggleType === "LIMITCLICKS" && isLimitNull) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "limitClicks é obrigatório para LIMITCLICKS",
            path: ["limitClicks"]
        });
    }
    if (data.toggleType === "TIMER" && isTimerNull) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "timerInMinutes é obrigatório para TIMER",
            path: ["timerInMinutes"]
        });
    }
});
