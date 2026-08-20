"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = require("./shared/security/cors");
const env_1 = require("./shared/config/env");
const helmet_1 = __importDefault(require("helmet"));
const auth_router_1 = require("./modules/auth/auth.router");
const links_router_1 = require("./modules/links/links.router");
const category_router_1 = require("./modules/category/category.router");
const errorHandler_1 = require("./shared/middlewares/errorHandler");
const app = (0, express_1.default)();
if (env_1.env.TRUST_PROXY) {
    app.set("trust proxy", 1);
}
app.disable("x-powered-by");
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
}));
app.use(cors_1.corsConfig);
app.use(express_1.default.json());
app.use("/auth", auth_router_1.authRoutes);
app.use("/links", links_router_1.linksRoutes);
app.use("/categories", category_router_1.categoryRoutes);
app.use(errorHandler_1.errorHandler);
exports.default = app;
