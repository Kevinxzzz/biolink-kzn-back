"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
    PORT: zod_1.z.string().default("3000"),
    DATABASE_URL: zod_1.z.string().default("postgresql://postgres:postgres@localhost:5432/biolink?schema=public"),
    JWT_SECRET: zod_1.z.string().min(10, "JWT_SECRET deve ter ao menos 10 caracteres").default("default-jwt-secret-key-for-dev-and-test"),
    FRONTEND_URL: zod_1.z.string().optional(),
    FRONTEND_URL_LOCAL: zod_1.z.string().optional(),
    TRUST_PROXY: zod_1.z.string().optional()
});
const _env = envSchema.safeParse(process.env);
if (!_env.success) {
    console.error("❌ Variáveis de ambiente inválidas:", _env.error.format());
    throw new Error("Falha na inicialização: variáveis de ambiente inválidas ou ausentes.");
}
exports.env = _env.data;
