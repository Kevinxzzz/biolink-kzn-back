import cors from "cors";
import { env } from "../config/env"

const allowedOrigins = [env.FRONTEND_URL, env.FRONTEND_URL_LOCAL].filter(Boolean) as string[];

export const corsConfig = cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
});