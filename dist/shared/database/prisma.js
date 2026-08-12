"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = exports.pool = void 0;
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = __importDefault(require("pg"));
const env_1 = require("../config/env");
exports.pool = new pg_1.default.Pool({
    connectionString: env_1.env.DATABASE_URL,
});
const adapter = new adapter_pg_1.PrismaPg(exports.pool);
exports.prisma = new client_1.PrismaClient({
    adapter,
    log: env_1.env.NODE_ENV === "development"
        ? ['query', 'info', 'warn', 'error']
        : env_1.env.NODE_ENV === "test"
            ? []
            : ['error'],
});
