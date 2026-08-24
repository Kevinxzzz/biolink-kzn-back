"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTemporalRotationWorker = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const cronTemporalRotation_service_1 = require("./cronTemporalRotation.service");
// O worker rodará a cada 1 minuto (* * * * *)
// Ele analisa as categorias configuradas com TIMER e os SCHEDULES vencidos
const startTemporalRotationWorker = () => {
    node_cron_1.default.schedule("* * * * *", async () => {
        try {
            console.log("[Worker - Temporal Rotation] Iniciando verificação de TIMER e SCHEDULE...");
            await (0, cronTemporalRotation_service_1.processTemporalRotations)();
            console.log("[Worker - Temporal Rotation] Verificação concluída com sucesso.");
        }
        catch (error) {
            console.error("[Worker - Temporal Rotation] Falha crítica na rotina de rotação temporal:", error);
        }
    });
    console.log("Cron job de Rotação Temporal (a cada 1 min) iniciado!");
};
exports.startTemporalRotationWorker = startTemporalRotationWorker;
