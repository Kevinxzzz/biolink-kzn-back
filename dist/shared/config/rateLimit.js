"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const appError_1 = require("../errors/appError");
const handler = () => {
    throw new appError_1.AppError("Limite de requisições excedido. Tente novamente mais tarde.", 429);
};
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 5000,
    max: 5,
    handler
});
