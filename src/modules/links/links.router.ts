import { Router } from "express";
import { UserRole } from "@prisma/client";
import { authenticate } from "../../shared/middlewares/authenticate";
import { hasRole } from "../../shared/middlewares/hasRole";
import * as linksController from "./links.controller";

const linksRoutes = Router();

// Middleware aplicado a todas as rotas do módulo de links
linksRoutes.use(authenticate);
linksRoutes.use(hasRole(UserRole.OWNER, UserRole.ADMIN));

linksRoutes.post("/", linksController.create);
linksRoutes.get("/", linksController.list);
linksRoutes.get("/:id", linksController.getById);
linksRoutes.patch("/reorder", linksController.reorder);
linksRoutes.patch("/:id", linksController.update);
linksRoutes.delete("/:id", linksController.remove);
linksRoutes.patch("/:id/activate", linksController.activate);

export { linksRoutes };
