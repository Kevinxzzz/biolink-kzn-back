import { Router } from "express";
import { authLimiter } from "../../shared/config/rateLimit";
import { login, registerCompany, getMe, logout } from "./auth.controller";
import { authenticate } from "../../shared/middlewares/authenticate";

const authRoutes = Router();

authRoutes.post("/register/enterprise", authLimiter, registerCompany);
authRoutes.post("/login", authLimiter, login);
authRoutes.post("/logout", logout);
authRoutes.get("/me", authenticate, getMe);

export { authRoutes };