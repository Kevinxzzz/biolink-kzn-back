import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate";
import { getDashboardController } from "./dashboard.controller";

export const dashboardRouter = Router();

dashboardRouter.get(
    "/",
    authenticate,
    getDashboardController
);
