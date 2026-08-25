import { Router } from "express";
import { UserRole } from "@prisma/client";
import { authenticate } from "../../shared/middlewares/authenticate";
import { hasRole } from "../../shared/middlewares/hasRole";
import * as schedulesController from "./schedules.controller";

const schedulesRoutes = Router();

schedulesRoutes.use(authenticate);
schedulesRoutes.use(hasRole(UserRole.OWNER, UserRole.ADMIN));

schedulesRoutes.post("/", schedulesController.create);
schedulesRoutes.get("/", schedulesController.list);
schedulesRoutes.get("/:id", schedulesController.getById);
schedulesRoutes.patch("/:id", schedulesController.update);
schedulesRoutes.delete("/:id", schedulesController.remove);

export { schedulesRoutes };
