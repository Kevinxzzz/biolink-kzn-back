import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.string().default("3000"),
    DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/biolink?schema=public"),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    JWT_SECRET: z.string().min(10, "JWT_SECRET deve ter ao menos 10 caracteres").default("default-jwt-secret-key-for-dev-and-test"),
    FRONTEND_URL: z.string().optional(),
    FRONTEND_URL_LOCAL: z.string().optional(),
    TRUST_PROXY: z.string().optional()
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error("❌ Variáveis de ambiente inválidas:", _env.error.format());
    throw new Error("Falha na inicialização: variáveis de ambiente inválidas ou ausentes.");
}

export const env = _env.data;