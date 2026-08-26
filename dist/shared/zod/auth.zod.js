"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEnterprisePayloadZod = exports.loginZod = void 0;
const zod_1 = require("zod");
exports.loginZod = zod_1.z.object({
    email: zod_1.z.string().email("Email inválido"),
    password: zod_1.z.string().min(6, "A senha deve ter ao menos 6 caracteres")
});
exports.registerEnterprisePayloadZod = zod_1.z.object({
    company: zod_1.z.object({
        name: zod_1.z.string().min(3, "Nome da empresa obrigatório"),
        email: zod_1.z.string().email("Email inválido"),
        phone: zod_1.z.string().regex(/^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/, "Telefone inválido")
    }),
    user: zod_1.z.object({
        name: zod_1.z.string().min(3, "Nome de usuário obrigatório"),
        email: zod_1.z.string().email("Email inválido"),
        password: zod_1.z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
        confirmPassword: zod_1.z.string()
    })
}).refine((data) => data.user.password === data.user.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["user", "confirmPassword"]
});
