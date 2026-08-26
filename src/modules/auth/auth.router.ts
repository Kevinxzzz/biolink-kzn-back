import { Router } from "express";
import { authLimiter } from "../../shared/config/rateLimit";
import { login, registerCompany } from "./auth.controller";

const authRoutes = Router();

authRoutes.post("/register/enterprise", authLimiter, registerCompany);
authRoutes.post("/login", authLimiter, login);

export { authRoutes };