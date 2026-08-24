import app from "./app";
import { env } from "./shared/config/env";
import { prisma, pool } from "./shared/database/prisma";

import { startConsolidationWorker } from "./modules/cronIncrement/cronIncrement.worker";
import { startTemporalRotationWorker } from "./modules/cronTemporalRotation/cronTemporalRotation.worker";

startConsolidationWorker();
startTemporalRotationWorker();

const server = app.listen(env.PORT, () => {
    console.log(`🚀 Server running on port ${env.PORT}`);
});

const gracefulShutdown = async (signal: string) => {
    console.log(`\nRecebido sinal ${signal}. Encerrando servidor graciosamente...`);
    server.close(async () => {
        console.log("Servidor HTTP encerrado.");
        try {
            await prisma.$disconnect();
            await pool.end();
            console.log("Conexões do banco de dados encerradas.");
            process.exit(0);
        } catch (error) {
            console.error("Erro ao encerrar conexões com o banco:", error);
            process.exit(1);
        }
    });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));