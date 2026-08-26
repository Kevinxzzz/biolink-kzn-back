import { consolidateClicks } from "./cronIncrement.service";
import { prisma } from "../../shared/database/prisma";
import { redis } from "../../shared/database/redis";

jest.mock("../../shared/database/prisma", () => ({
    prisma: {
        $transaction: jest.fn(),
        $executeRaw: jest.fn(),
        enterpriseUrl: {
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        enterpriseCountDailyClicks: {
            upsert: jest.fn(),
        }
    }
}));

jest.mock("../../shared/database/redis", () => ({
    redis: {
        scan: jest.fn(),
        get: jest.fn(),
        eval: jest.fn(),
    }
}));

describe("CronIncrement Module (Etapa 2) - Consolidação", () => {
    let mockTx: any;

    beforeEach(() => {
        mockTx = {
            $executeRaw: jest.fn(),
            enterpriseUrl: {
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            enterpriseCountDailyClicks: {
                upsert: jest.fn(),
            }
        };

        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
            return await cb(mockTx);
        });

        jest.clearAllMocks();
    });

    it("1/2/3/4. deve consolidar os cliques corretamente, atualizando o link ativo e o count diário (upsert)", async () => {
        // Mock SCAN to return 1 key, then cursor "0"
        (redis.scan as jest.Mock).mockResolvedValueOnce(["0", ["clicks:ent1:cat1"]]);
        
        // Mock active link
        mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link-ativo-1" });
        // Mock redis GET
        (redis.get as jest.Mock).mockResolvedValue("15");

        await consolidateClicks();

        // 10. Garante ordem segura: lock foi chamado
        expect(mockTx.$executeRaw).toHaveBeenCalled();

        // 12. Contador associado ao link ativo
        expect(mockTx.enterpriseUrl.update).toHaveBeenCalledWith({
            where: { id: "link-ativo-1" },
            data: {
                countClicks: { increment: 15 },
                updateAt: expect.any(Date)
            }
        });

        // 2/3/4. Upsert chamado corretamente
        expect(mockTx.enterpriseCountDailyClicks.upsert).toHaveBeenCalledWith({
            where: {
                enterpriseId_referenceDate: {
                    enterpriseId: "ent1",
                    referenceDate: expect.any(Date)
                }
            },
            create: expect.objectContaining({ dailyClicks: 15 }),
            update: expect.objectContaining({ dailyClicks: { increment: 15 } })
        });

        // 8. O decremento (eval) deve ocorrer dentro do mockTx do callback, e o mock garantirá o sucesso
        expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, "clicks:ent1:cat1", 15);
    });

    it("5/6. deve isolar múltiplas empresas e categorias corretamente", async () => {
        (redis.scan as jest.Mock).mockResolvedValueOnce(["0", ["clicks:entA:catA", "clicks:entB:catB"]]);
        
        mockTx.enterpriseUrl.findFirst
            .mockResolvedValueOnce({ id: "linkA" })
            .mockResolvedValueOnce({ id: "linkB" });

        (redis.get as jest.Mock)
            .mockResolvedValueOnce("10")
            .mockResolvedValueOnce("20");

        await consolidateClicks();

        expect(mockTx.enterpriseUrl.update).toHaveBeenCalledTimes(2);
        
        // Check entA
        expect(mockTx.enterpriseUrl.update).toHaveBeenNthCalledWith(1, {
            where: { id: "linkA" },
            data: expect.objectContaining({ countClicks: { increment: 10 } })
        });
        
        // Check entB
        expect(mockTx.enterpriseUrl.update).toHaveBeenNthCalledWith(2, {
            where: { id: "linkB" },
            data: expect.objectContaining({ countClicks: { increment: 20 } })
        });

        // Ambos os evals chamados
        expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, "clicks:entA:catA", 10);
        expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, "clicks:entB:catB", 20);
    });

    it("7. NÃO deve perder cliques (não chamar lua script) caso falhe a persistência no PostgreSQL", async () => {
        (redis.scan as jest.Mock).mockResolvedValueOnce(["0", ["clicks:ent1:cat1"]]);
        
        mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1" });
        (redis.get as jest.Mock).mockResolvedValue("15");

        // Simula falha no banco
        mockTx.enterpriseUrl.update.mockRejectedValue(new Error("DB Error"));

        await consolidateClicks();

        // Como o banco falhou na operação interna, NÃO deve decrementar no redis
        expect(redis.eval).not.toHaveBeenCalled();
    });

    it("8. deve compensar cliques no redis se o commit falhar após o decremento", async () => {
        (redis.scan as jest.Mock).mockResolvedValueOnce(["0", ["clicks:ent1:cat1"]]);
        mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1" });
        (redis.get as jest.Mock).mockResolvedValue("15");
        (redis.eval as jest.Mock).mockResolvedValue(1);
        (redis.incrby as jest.Mock) = jest.fn();

        (prisma.$transaction as jest.Mock).mockImplementationOnce(async (cb) => {
            await cb(mockTx);
            throw new Error("Commit Error");
        });

        await consolidateClicks();

        expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, "clicks:ent1:cat1", 15);
        expect(redis.incrby).toHaveBeenCalledWith("clicks:ent1:cat1", 15);
    });

    it("9. NÃO deve processar contador inexistente ou <= 0", async () => {
        (redis.scan as jest.Mock).mockResolvedValueOnce(["0", ["clicks:ent1:cat1", "clicks:ent1:cat2"]]);
        
        mockTx.enterpriseUrl.findFirst.mockResolvedValue({ id: "link1" });
        
        (redis.get as jest.Mock)
            .mockResolvedValueOnce("0")
            .mockResolvedValueOnce(null);

        await consolidateClicks();

        // A transação prossegue mas retorna antecipadamente sem update ou eval
        expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
        expect(redis.eval).not.toHaveBeenCalled();
    });

    it("11. NÃO deve processar quando não há link ativo na categoria", async () => {
        (redis.scan as jest.Mock).mockResolvedValueOnce(["0", ["clicks:ent1:cat1"]]);
        
        // Nenhuma rota ativa
        mockTx.enterpriseUrl.findFirst.mockResolvedValue(null);
        
        await consolidateClicks();

        // O redis.get não deve sequer ser chamado
        expect(redis.get).not.toHaveBeenCalled();
        expect(mockTx.enterpriseUrl.update).not.toHaveBeenCalled();
        expect(redis.eval).not.toHaveBeenCalled();
    });
});
