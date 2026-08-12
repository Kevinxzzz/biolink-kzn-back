import { Router } from "express";
import { authLimiter } from "../../shared/config/rateLimit";
import { login } from "./auth.controller";

const authRoutes = Router();

authRoutes.post("/register/enterprise", authLimiter);
authRoutes.post("/login", authLimiter, login);

export { authRoutes };