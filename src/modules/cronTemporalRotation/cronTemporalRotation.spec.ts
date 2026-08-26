import { processTemporalRotations } from "./cronTemporalRotation.service";
import { prisma } from "../../shared/database/prisma";
import * as linkUtils from "../../shared/utils/linkUtils";

jest.mock("../../shared/database/prisma", () => ({
    prisma: {
        $transaction: jest.fn(),
        $executeRaw: jest.fn(),
        categoryRotation: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        urlSchedule: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        enterpriseUrl: {
            findFirst: jest.fn(),
            update: jest.fn(),
        }
    }
}));

// Mock the helper function
jest.spyOn(linkUtils, "getNextEligibleLink");

describe("Temporal Rotation Module (Etapa 3) - TIMER e SCHEDULE", () => {
    let mockTx: any;

    beforeEach(() => {
        mockTx = {
            $executeRaw: jest.fn(),
            categoryRotation: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            urlSchedule: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            enterpriseUrl: {
                findFirst: jest.fn(),
                update: jest.fn(),
            }
        };

        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
            return await cb(mockTx);
        });

        jest.clearAllMocks();
    });

    describe("TIMER Rotations", () => {
        it("NÃO deve rotacionar se o timer ainda não expirou", async () => {
            const now = new Date();
            const futureTimer = new Date(now.getTime());
            
            (prisma.categoryRotation.findMany as jest.Mock).mockResolvedValueOnce([{
                categoryId: "cat1",
                toggleType: "TIMER",
                timerInMinutes: 10,
                timerStartedAt: futureTimer // started just now, so +10 min is in future
            }]);
            
            (prisma.urlSchedule.findMany as jest.Mock).mockResolvedValueOnce([]); // no schedules

            await processTemporalRotations();

            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("DEVE rotacionar se o timer expirou e existe próximo link", async () => {
            const pastTimer = new Date(new Date().getTime() - 20 * 60000); // 20 mins ago
            
            (prisma.categoryRotation.findMany as jest.Mock).mockResolvedValueOnce([{
                categoryId: "cat1",
                toggleType: "TIMER",
                timerInMinutes: 10,
                timerStartedAt: pastTimer
            }]);
            (prisma.urlSchedule.findMany as jest.Mock).mockResolvedValueOnce([]); 

            mockTx.categoryRotation.findUnique.mockResolvedValueOnce({
                categoryId: "cat1",
                toggleType: "TIMER",
                timerInMinutes: 10,
                timerStartedAt: pastTimer
            });

            mockTx.enterpriseUrl.findFirst.mockResolvedValueOnce({ id: "link-antigo", enterpriseId: "ent1" });
            
            (linkUtils.getNextEligibleLink as jest.Mock).mockResolvedValueOnce({ id: "link-novo" });

            await processTemporalRotations();

            expect(mockTx.$executeRaw).toHaveBeenCalled();
            // Desativou o antigo
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "link-antigo" },
                data: expect.objectContaining({ active: false })
            });
            // Ativou o novo
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "link-novo" },
                data: expect.objectContaining({ active: true })
            });
            // Atualizou o timerStartedAt
            expect(mockTx.categoryRotation.update).toHaveBeenCalledWith({
                where: { categoryId: "cat1" },
                data: expect.objectContaining({ timerStartedAt: expect.any(Date) })
            });
        });

        it("NÃO deve resetar o timer se não houver próximo link elegível", async () => {
            const pastTimer = new Date(new Date().getTime() - 20 * 60000); 
            
            (prisma.categoryRotation.findMany as jest.Mock).mockResolvedValueOnce([{
                categoryId: "cat1",
                toggleType: "TIMER",
                timerInMinutes: 10,
                timerStartedAt: pastTimer
            }]);
            (prisma.urlSchedule.findMany as jest.Mock).mockResolvedValueOnce([]); 

            mockTx.categoryRotation.findUnique.mockResolvedValueOnce({
                categoryId: "cat1",
                toggleType: "TIMER",
                timerInMinutes: 10,
                timerStartedAt: pastTimer
            });

            const sameLink = { id: "link-unico", enterpriseId: "ent1" };
            mockTx.enterpriseUrl.findFirst.mockResolvedValueOnce(sameLink);
            
            // O mock diz que o próximo link elegível é ele mesmo (ou null)
            (linkUtils.getNextEligibleLink as jest.Mock).mockResolvedValueOnce(sameLink);

            await processTemporalRotations();

            // Nenhuma atualização no banco
            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
            expect(mockTx.categoryRotation.update).not.toHaveBeenCalled();
        });
    });

    describe("SCHEDULE Rotations", () => {
        it("DEVE ativar link agendado ignorando inRotationPool e marcar como concluído", async () => {
            (prisma.categoryRotation.findMany as jest.Mock).mockResolvedValueOnce([]); // No timers

            const pastDate = new Date(new Date().getTime() - 5000);
            (prisma.urlSchedule.findMany as jest.Mock).mockResolvedValueOnce([{
                id: "sched1",
                enterpriseUrlId: "link-agendado",
                active: true,
                dateTime: pastDate,
                enterpriseUrl: { categoryId: "cat1" }
            }]);

            mockTx.urlSchedule.findUnique.mockResolvedValueOnce({
                id: "sched1",
                active: true,
                dateTime: pastDate
            });

            mockTx.enterpriseUrl.findFirst.mockResolvedValueOnce({ id: "link-antigo", enterpriseId: "ent1" });

            await processTemporalRotations();

            expect(mockTx.$executeRaw).toHaveBeenCalled();
            // Desativou antigo
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "link-antigo" },
                data: expect.objectContaining({ active: false })
            });
            // Ativou agendado
            expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
                where: { id: "link-agendado" },
                data: expect.objectContaining({ active: true })
            });
            // Finalizou schedule
            expect(mockTx.urlSchedule.update).toHaveBeenCalledWith({
                where: { id: "sched1" },
                data: expect.objectContaining({ active: false })
            });
        });

        it("DEVE apenas concluir o schedule se o link alvo já for o ativo", async () => {
            (prisma.categoryRotation.findMany as jest.Mock).mockResolvedValueOnce([]); 

            const pastDate = new Date(new Date().getTime() - 5000);
            (prisma.urlSchedule.findMany as jest.Mock).mockResolvedValueOnce([{
                id: "sched1",
                enterpriseUrlId: "link-agendado",
                active: true,
                dateTime: pastDate,
                enterpriseUrl: { categoryId: "cat1" }
            }]);

            mockTx.urlSchedule.findUnique.mockResolvedValueOnce({
                id: "sched1",
                active: true,
                dateTime: pastDate
            });

            // O link ATUAL já é o link-agendado
            mockTx.enterpriseUrl.findFirst.mockResolvedValueOnce({ id: "link-agendado", enterpriseId: "ent1" });

            await processTemporalRotations();

            // NÃO muda o active dos links
            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
            
            // Mas FINALIZA o schedule
            expect(mockTx.urlSchedule.update).toHaveBeenCalledWith({
                where: { id: "sched1" },
                data: expect.objectContaining({ active: false })
            });
        });
    });
});
