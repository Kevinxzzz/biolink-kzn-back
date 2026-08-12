"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
exports.env = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    PORT: process.env.PORT,
    FRONTEND_URL: process.env.FRONTEND_URL,
    FRONTEND_URL_LOCAL: process.env.FRONTEND_URL_LOCAL,
    TRUST_PROXY: process.env.TRUST_PROXY,
    JWT_SECRET: process.env.JWT_SECRET || process.env.JWT_SECRECT
};
