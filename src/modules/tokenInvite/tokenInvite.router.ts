import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate";
import { hasRole } from "../../shared/middlewares/hasRole";
import * as tokenInviteController from "./tokenInvite.controller";
import { authLimiter } from "../../shared/config/rateLimit"; // Usar limiter para registro

const tokenInviteRoutes = Router();

// Rotas Administrativas (OWNER)
tokenInviteRoutes.post("/", authenticate, hasRole("OWNER"), tokenInviteController.create);
tokenInviteRoutes.get("/", authenticate, hasRole("OWNER"), tokenInviteController.list);
tokenInviteRoutes.delete("/:id", authenticate, hasRole("OWNER"), tokenInviteController.remove);

// Rotas Públicas (Registro via convite)
tokenInviteRoutes.get("/invite/:token/validate", tokenInviteController.validate);
tokenInviteRoutes.post("/invite/:token/register", authLimiter, tokenInviteController.register);

export { tokenInviteRoutes };
