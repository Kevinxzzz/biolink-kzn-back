import cors from "cors";
import { env } from "../config/env"

export const corsConfig = cors({
    origin: [env.DATABASE_URL!, env.FRONTEND_URL_LOCAL!],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false

})