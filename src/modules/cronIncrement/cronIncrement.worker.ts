import cron from "node-cron";
import { consolidateClicks } from "./cronIncrement.service";

// O worker rodará a cada 20 minutos (*/20 * * * *)
// Ele consolida no PostgreSQL todos os cliques acumulados no Redis.
export const startConsolidationWorker = () => {
    cron.schedule("*/20 * * * *", async () => {
        try {
            console.log("[Worker - Consolidation] Iniciando varredura no Redis para consolidar cliques...");
            await consolidateClicks();
            console.log("[Worker - Consolidation] Consolidação concluída com sucesso.");
        } catch (error) {
            console.error("[Worker - Consolidation] Falha crítica na rotina de consolidação:", error);
        }
    });

    console.log("Cron job de incrementação de cliques (a cada 20 min) iniciado!");
};
