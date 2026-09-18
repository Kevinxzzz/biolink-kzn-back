import { Router } from "express";
import { UserRole } from "@prisma/client";
import { authenticate } from "../../shared/middlewares/authenticate";
import { hasRole } from "../../shared/middlewares/hasRole";
import * as influencerController from "./influencer.controller";

const influencerRoutes = Router();

influencerRoutes.get("/public/:slug", influencerController.getPublicBySlug);

influencerRoutes.use(authenticate);
influencerRoutes.post("/", hasRole(UserRole.OWNER, UserRole.ADMIN), influencerController.create);
influencerRoutes.get("/", hasRole(UserRole.OWNER, UserRole.ADMIN), influencerController.list);
influencerRoutes.get("/:id", hasRole(UserRole.OWNER, UserRole.ADMIN), influencerController.getById);
influencerRoutes.patch("/:id", hasRole(UserRole.OWNER), influencerController.update);
influencerRoutes.delete("/:id", hasRole(UserRole.OWNER), influencerController.remove);

export { influencerRoutes };
