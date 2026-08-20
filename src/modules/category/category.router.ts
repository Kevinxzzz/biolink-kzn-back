import { Router } from "express";
import { UserRole } from "@prisma/client";
import { authenticate } from "../../shared/middlewares/authenticate";
import { hasRole } from "../../shared/middlewares/hasRole";
import * as categoryController from "./category.controller";

const categoryRoutes = Router();

// Middleware aplicado a todas as rotas do módulo de categorias
categoryRoutes.use(authenticate);
categoryRoutes.use(hasRole(UserRole.OWNER, UserRole.ADMIN));

categoryRoutes.post("/", categoryController.create);
categoryRoutes.get("/", categoryController.list);
categoryRoutes.get("/:id", categoryController.getById);
categoryRoutes.patch("/:id", categoryController.update);
categoryRoutes.delete("/:id", categoryController.remove);

export { categoryRoutes };
