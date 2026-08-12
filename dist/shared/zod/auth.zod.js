"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEnterpriseZod = exports.loginZod = void 0;
const zod_1 = require("zod");
exports.loginZod = zod_1.z.object({
    email: zod_1.z.string().email("Email inválido"),
    password: zod_1.z.string().min(6, "A senha deve ter ao menos 6 caracteres")
});
exports.registerEnterpriseZod = zod_1.z.object({
    name: zod_1.z.string().min(3, "O nome deve ter no mínimmo 3 caracteres"),
    email: zod_1.z.string().email("Email inválido"),
    phoneNumber: zod_1.z.string().regex(/^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/, "Telefone inválido"),
});
