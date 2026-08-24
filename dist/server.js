"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./shared/config/env");
const prisma_1 = require("./shared/database/prisma");
const cronIncrement_worker_1 = require("./modules/cronIncrement/cronIncrement.worker");
const cronTemporalRotation_worker_1 = require("./modules/cronTemporalRotation/cronTemporalRotation.worker");
(0, cronIncrement_worker_1.startConsolidationWorker)();
(0, cronTemporalRotation_worker_1.startTemporalRotationWorker)();
const server = app_1.default.listen(env_1.env.PORT, () => {
    console.log(`🚀 Server running on port ${env_1.env.PORT}`);
});
const gracefulShutdown = async (signal) => {
    console.log(`\nRecebido sinal ${signal}. Encerrando servidor graciosamente...`);
    server.close(async () => {
        console.log("Servidor HTTP encerrado.");
        try {
            await prisma_1.prisma.$disconnect();
            await prisma_1.pool.end();
            console.log("Conexões do banco de dados encerradas.");
            process.exit(0);
        }
        catch (error) {
            console.error("Erro ao encerrar conexões com o banco:", error);
            process.exit(1);
        }
    });
};
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
