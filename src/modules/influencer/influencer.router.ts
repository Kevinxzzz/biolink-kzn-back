import { Router } from "express";
import { UserRole } from "@prisma/client";
import { authenticate } from "../../shared/middlewares/authenticate";
import { hasRole } from "../../shared/middlewares/hasRole";
import * as influencerController from "./influencer.controller";

const influencerRoutes = Router();

// Middleware aplicado a todas as rotas do módulo de influenciadores
influencerRoutes.use(authenticate);
influencerRoutes.use(hasRole(UserRole.OWNER, UserRole.ADMIN));

influencerRoutes.post("/", influencerController.create);
influencerRoutes.get("/", influencerController.list);
influencerRoutes.get("/:id", influencerController.getById);
influencerRoutes.patch("/:id", influencerController.update);
influencerRoutes.delete("/:id", influencerController.remove);

export { influencerRoutes };
