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
        },
        influencer: {
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        influencerCountDailyClicks: {
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
            },
            influencer: {
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            influencerCountDailyClicks: {
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

    describe("Consolidação de Influenciadores (Etapa 4)", () => {
        const { consolidateInfluencerClicks } = require("./cronIncrement.service");

        it("Caso 1 - Sucesso total na consolidação do influenciador", async () => {
            (redis.scan as jest.Mock).mockResolvedValueOnce(["0", ["influencer_clicks:ent1:inf1"]]);
            mockTx.influencer.findFirst.mockResolvedValue({ id: "inf1", enterpriseId: "ent1" });
            (redis.get as jest.Mock).mockResolvedValue("50");
            (redis.eval as jest.Mock).mockResolvedValue(1);

            await consolidateInfluencerClicks();

            // Verifica as atualizações
            expect(mockTx.influencer.update).toHaveBeenCalledWith({
                where: { id: "inf1" },
                data: {
                    counterEntries: { increment: 50 },
                    updateAt: expect.any(Date)
                }
            });

            expect(mockTx.influencerCountDailyClicks.upsert).toHaveBeenCalledWith({
                where: {
                    influencerId_referenceDate: {
                        influencerId: "inf1",
                        referenceDate: expect.any(Date)
                    }
                },
                create: expect.objectContaining({ dailyClicks: 50 }),
                update: expect.objectContaining({ dailyClicks: { increment: 50 } })
            });

            // Decremento do redis
            expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, "influencer_clicks:ent1:inf1", 50);
        });

        it("Caso 2 - Novos cliques durante o processamento não são perdidos (eval cuida disso)", async () => {
            (redis.scan as jest.Mock).mockResolvedValueOnce(["0", ["influencer_clicks:ent1:inf1"]]);
            mockTx.influencer.findFirst.mockResolvedValue({ id: "inf1", enterpriseId: "ent1" });
            (redis.get as jest.Mock).mockResolvedValue("50"); // Lê 50
            (redis.eval as jest.Mock).mockResolvedValue(1); // Lua decrementa 50, se chegar mais 20 no meio, eles ficam lá intactos

            await consolidateInfluencerClicks();

            expect(mockTx.influencer.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ counterEntries: { increment: 50 } }) })
            );
            expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, "influencer_clicks:ent1:inf1", 50);
        });

        it("Caso 3 - Compensação se ocorrer erro no PostgreSQL (rollback do redis)", async () => {
            (redis.scan as jest.Mock).mockResolvedValueOnce(["0", ["influencer_clicks:ent1:inf1"]]);
            mockTx.influencer.findFirst.mockResolvedValue({ id: "inf1" });
            (redis.get as jest.Mock).mockResolvedValue("50");
            (redis.eval as jest.Mock).mockResolvedValue(1); // Lua rodou e decrementou
            (redis.incrby as jest.Mock) = jest.fn();

            // Simula uma quebra no commit da transação (após o eval ter sido acionado na rotina de tx mockada)
            (prisma.$transaction as jest.Mock).mockImplementationOnce(async (cb) => {
                await cb(mockTx);
                throw new Error("Simulated PG Failure");
            });

            await consolidateInfluencerClicks();

            expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, "influencer_clicks:ent1:inf1", 50);
            // Deve compensar
            expect(redis.incrby).toHaveBeenCalledWith("influencer_clicks:ent1:inf1", 50);
        });

        it("Caso 4 e 6 - Múltiplas chaves processadas de forma isolada, erro em uma não impede a outra", async () => {
            (redis.scan as jest.Mock).mockResolvedValueOnce(["0", ["influencer_clicks:E1:I1", "influencer_clicks:E2:I2"]]);
            
            // Primeira iteração do tx quebra
            (prisma.$transaction as jest.Mock)
                .mockImplementationOnce(async () => { throw new Error("Erro isolado na chave I1"); })
                .mockImplementationOnce(async (cb) => { return await cb(mockTx); });
            
            mockTx.influencer.findFirst.mockResolvedValue({ id: "I2" }); // pra segunda iteracao
            (redis.get as jest.Mock).mockResolvedValue("30");
            (redis.eval as jest.Mock).mockResolvedValue(1);

            await consolidateInfluencerClicks();

            // A chave I1 falhou internamente no try-catch do loop. A chave I2 tem que ser processada.
            expect(mockTx.influencer.update).toHaveBeenCalledWith({
                where: { id: "I2" },
                data: expect.objectContaining({ counterEntries: { increment: 30 } })
            });
            expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, "influencer_clicks:E2:I2", 30);
        });

        it("Caso 5 - Influencer inexistente remove a chave do redis e aborta silenciosamente", async () => {
            (redis.scan as jest.Mock).mockResolvedValueOnce(["0", ["influencer_clicks:ent1:inf1"]]);
            mockTx.influencer.findFirst.mockResolvedValue(null); // Influenciador apagado do PG
            (redis.del as jest.Mock) = jest.fn();

            await consolidateInfluencerClicks();

            // Apaga a chave órfã
            expect(redis.del).toHaveBeenCalledWith("influencer_clicks:ent1:inf1");
            // Não deve tentar atualizar dados
            expect(redis.get).not.toHaveBeenCalled();
            expect(mockTx.influencer.update).not.toHaveBeenCalled();
            expect(redis.eval).not.toHaveBeenCalled();
        });
    });
});
