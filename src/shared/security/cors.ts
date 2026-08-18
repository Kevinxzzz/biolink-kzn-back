import cors from "cors";
import { env } from "../config/env"


export const corsConfig = cors({
    origin: env.FRONTEND_URL,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
});