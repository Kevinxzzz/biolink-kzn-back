import { Router } from "express";
import { authLimiter } from "../../shared/config/rateLimit";
import { login, registerCompany, getMe } from "./auth.controller";
import { authenticate } from "../../shared/middlewares/authenticate";

const authRoutes = Router();

authRoutes.post("/register/enterprise", authLimiter, registerCompany);
authRoutes.post("/login", authLimiter, login);
authRoutes.get("/me", authenticate, getMe);

export { authRoutes };