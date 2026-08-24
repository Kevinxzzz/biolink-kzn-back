"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryRoutes = void 0;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const authenticate_1 = require("../../shared/middlewares/authenticate");
const hasRole_1 = require("../../shared/middlewares/hasRole");
const categoryController = __importStar(require("./category.controller"));
const categoryRoutes = (0, express_1.Router)();
exports.categoryRoutes = categoryRoutes;
// Middleware aplicado a todas as rotas do módulo de categorias
categoryRoutes.use(authenticate_1.authenticate);
categoryRoutes.use((0, hasRole_1.hasRole)(client_1.UserRole.OWNER, client_1.UserRole.ADMIN));
categoryRoutes.post("/", categoryController.create);
categoryRoutes.get("/", categoryController.list);
categoryRoutes.get("/:id/rotation", categoryController.getCategoryRotation);
categoryRoutes.patch("/:id/rotation", categoryController.updateCategoryRotation);
categoryRoutes.get("/:id", categoryController.getById);
categoryRoutes.patch("/:id", categoryController.update);
categoryRoutes.delete("/:id", categoryController.remove);
