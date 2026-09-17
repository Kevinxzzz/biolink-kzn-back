"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRouter = void 0;
const express_1 = require("express");
const authenticate_1 = require("../../shared/middlewares/authenticate");
const dashboard_controller_1 = require("./dashboard.controller");
exports.dashboardRouter = (0, express_1.Router)();
exports.dashboardRouter.get("/", authenticate_1.authenticate, dashboard_controller_1.getDashboardController);
