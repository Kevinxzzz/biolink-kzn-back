import { createSchedule, getSchedules, getScheduleById, updateSchedule, deleteSchedule } from "./schedules.service";
import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/appError";
import { createScheduleZod, updateScheduleZod } from "../../shared/zod/schedules.zod";

jest.mock("../../shared/database/prisma", () => ({
    prisma: {
        $transaction: jest.fn(),
        $executeRaw: jest.fn(),
        urlSchedule: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        },
        enterpriseUrl: {
            findFirst: jest.fn(),
        }
    }
}));

describe("Schedules Module", () => {
    let mockTx: any;

    beforeEach(() => {
        mockTx = {
            $executeRaw: jest.fn(),
            urlSchedule: {
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
            enterpriseUrl: {
                findFirst: jest.fn()
            }
        };

        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
            return await cb(mockTx);
        });

        jest.clearAllMocks();
    });

    describe("CRUD", () => {
        it("deve criar um agendamento com sucesso", async () => {
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1", categoryId: "cat1" });
            mockTx.urlSchedule.findFirst.mockResolvedValue(null); // Sem conflito
            mockTx.urlSchedule.create.mockResolvedValue({ id: "sch1" });

            const data = { enterpriseUrlId: "link1", dateTime: new Date(Date.now() + 100000) };
            const result = await createSchedule("ent1", data);

            expect(mockTx.enterpriseUrl.findFirst).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: "link1", enterpriseId: "ent1" }
            }));
            expect(mockTx.urlSchedule.findFirst).toHaveBeenCalled();
            expect(mockTx.urlSchedule.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ active: true, enterpriseUrlId: "link1" })
            }));
            expect(result.id).toBe("sch1");
        });

        it("não deve permitir criar agendamento se houver conflito", async () => {
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1", categoryId: "cat1" });
            mockTx.urlSchedule.findFirst.mockResolvedValue({ id: "sch_existente" }); // Conflito encontrado

            const data = { enterpriseUrlId: "link1", dateTime: new Date(Date.now() + 100000) };
            
            await expect(createSchedule("ent1", data)).rejects.toMatchObject({
                statusCode: 409,
                message: "Já existe um agendamento ativo para esta data/hora na mesma categoria."
            });
        });

        it("deve listar agendamentos da empresa autenticada", async () => {
            (prisma.urlSchedule.findMany as jest.Mock).mockResolvedValue([{ id: "sch1" }]);
            const result = await getSchedules("ent1");
            expect(prisma.urlSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { enterpriseUrl: { enterpriseId: "ent1" } }
            }));
            expect(result.length).toBe(1);
        });

        it("deve buscar agendamento por ID", async () => {
            (prisma.urlSchedule.findFirst as jest.Mock).mockResolvedValue({ id: "sch1" });
            const result = await getScheduleById("sch1", "ent1");
            expect(prisma.urlSchedule.findFirst).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: "sch1", enterpriseUrl: { enterpriseId: "ent1" } }
            }));
            expect(result.id).toBe("sch1");
        });

        it("deve atualizar um agendamento mudando link e validando a nova categoria", async () => {
            mockTx.urlSchedule.findFirst
                .mockResolvedValueOnce({ id: "sch1", active: true, dateTime: new Date(), enterpriseUrlId: "link1", enterpriseUrl: { categoryId: "cat1" } }) // schedule atual
                .mockResolvedValueOnce(null); // sem conflito
            
            mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link2", categoryId: "cat2" }); // novo link
            mockTx.urlSchedule.update.mockResolvedValue({ id: "sch1" });

            const data = { enterpriseUrlId: "link2", active: true };
            await updateSchedule("sch1", "ent1", data);

            expect(mockTx.enterpriseUrl.findFirst).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: "link2", enterpriseId: "ent1" }
            }));
            // Verifica lock: $executeRaw tem string parts. `cat2` deve estar nos valores passados.
            expect(mockTx.$executeRaw.mock.calls[0][1]).toBe("cat2"); 
            expect(mockTx.urlSchedule.update).toHaveBeenCalled();
        });

        it("não deve permitir atualizar link se ele não pertencer à empresa", async () => {
            mockTx.urlSchedule.findFirst.mockResolvedValue({ id: "sch1", enterpriseUrl: { categoryId: "cat1" } });
            mockTx.enterpriseUrl.findFirst.mockResolvedValue(null); // Novo link não encontrado/outra empresa

            await expect(updateSchedule("sch1", "ent1", { enterpriseUrlId: "link2" })).rejects.toMatchObject({
                statusCode: 404,
                message: "Novo link não encontrado ou não pertence a esta empresa"
            });
        });

        it("deve excluir um agendamento com sucesso", async () => {
            (prisma.urlSchedule.findFirst as jest.Mock).mockResolvedValue({ id: "sch1" });
            (prisma.urlSchedule.delete as jest.Mock).mockResolvedValue({ id: "sch1" });
            
            await deleteSchedule("sch1", "ent1");
            expect(prisma.urlSchedule.delete).toHaveBeenCalledWith({ where: { id: "sch1" } });
        });
        
        it("validação Zod: create falha se dateTime no passado", () => {
            const result = createScheduleZod.safeParse({ enterpriseUrlId: "4a51e600-9a84-47cd-be56-0268a2bf66f3", dateTime: new Date(Date.now() - 100000) });
            expect(result.success).toBe(false);
        });

        it("validação Zod: update passa com data no passado se for cancelar", () => {
            const result = updateScheduleZod.safeParse({ active: false, dateTime: new Date(Date.now() - 100000) });
            expect(result.success).toBe(true);
        });
    });
});
