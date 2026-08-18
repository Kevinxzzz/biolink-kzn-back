import express from "express";
import { corsConfig } from "./shared/security/cors";
import { env } from "./shared/config/env"
import helmet from "helmet";

import { authRoutes } from "./modules/auth/auth.router";
import { linksRoutes } from "./modules/links/links.router";
import { errorHandler } from "./shared/middlewares/errorHandler";

const app = express();

if (env.TRUST_PROXY) {
    app.set("trust proxy", 1);
}

app.disable("x-powered-by");

app.use(helmet({
    contentSecurityPolicy: false,
}));

app.use(corsConfig);
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/links", linksRoutes);

app.use(errorHandler);

export default app;