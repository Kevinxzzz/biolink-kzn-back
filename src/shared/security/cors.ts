import cors from "cors";
import { env } from "../config/env"


export const corsConfig = cors({
    origin: [env.KZN_URL!, env.IMPERIO_URL!, env.ALECIO_URL],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
});