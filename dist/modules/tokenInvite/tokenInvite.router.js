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
exports.tokenInviteRoutes = void 0;
const express_1 = require("express");
const authenticate_1 = require("../../shared/middlewares/authenticate");
const hasRole_1 = require("../../shared/middlewares/hasRole");
const tokenInviteController = __importStar(require("./tokenInvite.controller"));
const rateLimit_1 = require("../../shared/config/rateLimit"); // Usar limiter para registro
const tokenInviteRoutes = (0, express_1.Router)();
exports.tokenInviteRoutes = tokenInviteRoutes;
// Rotas Administrativas (OWNER)
tokenInviteRoutes.post("/", authenticate_1.authenticate, (0, hasRole_1.hasRole)("OWNER"), tokenInviteController.create);
tokenInviteRoutes.get("/", authenticate_1.authenticate, (0, hasRole_1.hasRole)("OWNER"), tokenInviteController.list);
tokenInviteRoutes.delete("/:id", authenticate_1.authenticate, (0, hasRole_1.hasRole)("OWNER"), tokenInviteController.remove);
// Rotas Públicas (Registro via convite)
tokenInviteRoutes.get("/invite/:token/validate", tokenInviteController.validate);
tokenInviteRoutes.post("/invite/:token/register", rateLimit_1.authLimiter, tokenInviteController.register);
