import cron from "node-cron";
import { processTemporalRotations } from "./cronTemporalRotation.service";

// O worker rodará a cada 1 minuto (* * * * *)
// Ele analisa as categorias configuradas com TIMER e os SCHEDULES vencidos
export const startTemporalRotationWorker = () => {
    cron.schedule("* * * * *", async () => {
        try {
            console.log("[Worker - Temporal Rotation] Iniciando verificação de TIMER e SCHEDULE...");
            await processTemporalRotations();
            console.log("[Worker - Temporal Rotation] Verificação concluída com sucesso.");
        } catch (error) {
            console.error("[Worker - Temporal Rotation] Falha crítica na rotina de rotação temporal:", error);
        }
    });

    console.log("Cron job de Rotação Temporal (a cada 1 min) iniciado!");
};
