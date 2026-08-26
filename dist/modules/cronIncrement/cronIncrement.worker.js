"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startConsolidationWorker = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const cronIncrement_service_1 = require("./cronIncrement.service");
// O worker rodará a cada 20 minutos (*/20 * * * *)
// Ele consolida no PostgreSQL todos os cliques acumulados no Redis.
const startConsolidationWorker = () => {
    node_cron_1.default.schedule("*/20 * * * *", async () => {
        try {
            console.log("[Worker - Consolidation] Iniciando varredura no Redis para consolidar cliques...");
            await (0, cronIncrement_service_1.consolidateClicks)();
            console.log("[Worker - Consolidation] Consolidação concluída com sucesso.");
        }
        catch (error) {
            console.error("[Worker - Consolidation] Falha crítica na rotina de consolidação:", error);
        }
    });
    console.log("Cron job de incrementação de cliques (a cada 20 min) iniciado!");
};
exports.startConsolidationWorker = startConsolidationWorker;
