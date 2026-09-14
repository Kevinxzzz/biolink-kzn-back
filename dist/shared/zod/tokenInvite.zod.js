"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerViaTokenZod = exports.createTokenInviteZod = void 0;
const zod_1 = require("zod");
exports.createTokenInviteZod = zod_1.z.object({
    maxUses: zod_1.z.number().int().positive().optional(),
    expiresInHours: zod_1.z.number().int().positive()
});
exports.registerViaTokenZod = zod_1.z.object({
    name: zod_1.z.string().min(3, "O nome deve ter no mínimo 3 caracteres"),
    email: zod_1.z.string().email("O e-mail informado é inválido"),
    password: zod_1.z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
    confirmPassword: zod_1.z.string().min(8, "A confirmação deve ter no mínimo 8 caracteres")
}).refine(data => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
});
