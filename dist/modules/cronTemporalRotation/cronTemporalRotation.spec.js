"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const cronTemporalRotation_service_1 = require("./cronTemporalRotation.service");
const prisma_1 = require("../../shared/database/prisma");
const linkUtils = __importStar(require("../../shared/utils/linkUtils"));
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
    let mockTx;
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
        prisma_1.prisma.$transaction.mockImplementation(async (cb) => {
            return await cb(mockTx);
        });
        jest.clearAllMocks();
    });
    describe("TIMER Rotations", () => {
        it("NÃO deve rotacionar se o timer ainda não expirou", async () => {
            const now = new Date();
            const futureTimer = new Date(now.getTime());
            prisma_1.prisma.categoryRotation.findMany.mockResolvedValueOnce([{
                    categoryId: "cat1",
                    toggleType: "TIMER",
                    timerInMinutes: 10,
                    timerStartedAt: futureTimer // started just now, so +10 min is in future
                }]);
            prisma_1.prisma.urlSchedule.findMany.mockResolvedValueOnce([]); // no schedules
            await (0, cronTemporalRotation_service_1.processTemporalRotations)();
            expect(prisma_1.prisma.$transaction).not.toHaveBeenCalled();
        });
        it("DEVE rotacionar se o timer expirou e existe próximo link", async () => {
            const pastTimer = new Date(new Date().getTime() - 20 * 60000); // 20 mins ago
            prisma_1.prisma.categoryRotation.findMany.mockResolvedValueOnce([{
                    categoryId: "cat1",
                    toggleType: "TIMER",
                    timerInMinutes: 10,
                    timerStartedAt: pastTimer
                }]);
            prisma_1.prisma.urlSchedule.findMany.mockResolvedValueOnce([]);
            mockTx.categoryRotation.findUnique.mockResolvedValueOnce({
                categoryId: "cat1",
                toggleType: "TIMER",
                timerInMinutes: 10,
                timerStartedAt: pastTimer
            });
            mockTx.enterpriseUrl.findFirst.mockResolvedValueOnce({ id: "link-antigo", enterpriseId: "ent1" });
            linkUtils.getNextEligibleLink.mockResolvedValueOnce({ id: "link-novo" });
            await (0, cronTemporalRotation_service_1.processTemporalRotations)();
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
            prisma_1.prisma.categoryRotation.findMany.mockResolvedValueOnce([{
                    categoryId: "cat1",
                    toggleType: "TIMER",
                    timerInMinutes: 10,
                    timerStartedAt: pastTimer
                }]);
            prisma_1.prisma.urlSchedule.findMany.mockResolvedValueOnce([]);
            mockTx.categoryRotation.findUnique.mockResolvedValueOnce({
                categoryId: "cat1",
                toggleType: "TIMER",
                timerInMinutes: 10,
                timerStartedAt: pastTimer
            });
            const sameLink = { id: "link-unico", enterpriseId: "ent1" };
            mockTx.enterpriseUrl.findFirst.mockResolvedValueOnce(sameLink);
            // O mock diz que o próximo link elegível é ele mesmo (ou null)
            linkUtils.getNextEligibleLink.mockResolvedValueOnce(sameLink);
            await (0, cronTemporalRotation_service_1.processTemporalRotations)();
            // Nenhuma atualização no banco
            expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
            expect(mockTx.categoryRotation.update).not.toHaveBeenCalled();
        });
    });
    describe("SCHEDULE Rotations", () => {
        it("DEVE ativar link agendado ignorando inRotationPool e marcar como concluído", async () => {
            prisma_1.prisma.categoryRotation.findMany.mockResolvedValueOnce([]); // No timers
            const pastDate = new Date(new Date().getTime() - 5000);
            prisma_1.prisma.urlSchedule.findMany.mockResolvedValueOnce([{
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
            await (0, cronTemporalRotation_service_1.processTemporalRotations)();
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
            prisma_1.prisma.categoryRotation.findMany.mockResolvedValueOnce([]);
            const pastDate = new Date(new Date().getTime() - 5000);
            prisma_1.prisma.urlSchedule.findMany.mockResolvedValueOnce([{
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
            await (0, cronTemporalRotation_service_1.processTemporalRotations)();
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
