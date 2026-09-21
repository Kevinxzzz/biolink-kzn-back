import request from "supertest";
import app from "../app";
import { prisma, pool } from "../shared/database/prisma";
import { redis } from "../shared/database/redis";

describe("HTTP Flow: Click Deduplication & Authentication", () => {
    let enterpriseId: string;
    let categoryId: string;
    let linkAId: string;
    let applicationId: string;
    let domain = "cookie-test.com";
    let token: string;
    let influencerSlug = "test-influencer";
    let influencerId: string;

    beforeAll(async () => {
        // Limpeza prévia
        const oldApp = await prisma.application.findUnique({ where: { domain } });
        if (oldApp) {
            await prisma.enterprise.deleteMany({ where: { applicationId: oldApp.id } });
            await prisma.application.delete({ where: { id: oldApp.id } });
        }

        // Setup 
        const appRecord = await prisma.application.create({
            data: { domain, name: "Cookie Test App", createAt: new Date(), updateAt: new Date() }
        });
        applicationId = appRecord.id;

        const enterprise = await prisma.enterprise.create({
            data: { name: "Test Enterprise", email: "cookie@ent.com", phoneNumber: "99999", applicationId, createAt: new Date(), updateAt: new Date() }
        });
        enterpriseId = enterprise.id;

        const role = await prisma.role.findFirst({ where: { role: "OWNER" } });
        const user = await prisma.user.create({
            data: { name: "Tester", email: "tester@ent.com", password: "hashed", enterpriseId, roleId: role!.id, createAt: new Date(), updateAt: new Date() }
        });

        // Gerar token válido
        const { sign } = require("jsonwebtoken");
        const { env } = require("../shared/config/env");
        token = sign(
            { sub: user.id, accountType: "USER", applicationId, id: user.id, email: user.email, enterpriseId: user.enterpriseId, role: role!.role },
            env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        const category = await prisma.enterpriseCategory.create({
            data: { enterpriseId, name: "cat_cookie", createAt: new Date(), updateAt: new Date() }
        });
        categoryId = category.id;

        const linkA = await prisma.enterpriseUrl.create({
            data: { enterpriseId, categoryId, title: "Link A", countClicks: 0, url: "http://linka.com", active: true, order: 1, createAt: new Date(), updateAt: new Date() }
        });
        linkAId = linkA.id;

        const influencer = await prisma.influencer.create({
            data: { enterpriseId, name: "Influencer", slug: influencerSlug, personalUrl: "", counterEntries: 0, createAt: new Date(), updateAt: new Date() }
        });
        influencerId = influencer.id;

        await prisma.categoryRotation.create({
            data: { categoryId, toggleType: "MANUAL", updateAt: new Date() }
        });
    });

    afterAll(async () => {
        await prisma.influencer.deleteMany({ where: { enterpriseId } });
        await prisma.enterpriseUrl.deleteMany({ where: { enterpriseId } });
        await prisma.categoryRotation.deleteMany({ where: { categoryId } });
        await prisma.enterpriseCategory.deleteMany({ where: { enterpriseId } });
        await prisma.user.deleteMany({ where: { enterpriseId } });
        await prisma.enterprise.deleteMany({ where: { id: enterpriseId } });
        await prisma.application.delete({ where: { id: applicationId } });
        await prisma.$disconnect();
        await pool.end();
        await redis.quit();
    });

    beforeEach(async () => {
        await redis.flushall();
        await prisma.enterpriseUrl.update({
            where: { id: linkAId },
            data: { countClicks: 0 }
        });
    });

    it("Visitante SEM cookie: deve gerar visitor cookie e contabilizar clique (Categoria + Influenciador)", async () => {
        const response = await request(app)
            .get(`/links/redirect/${categoryId}?influencer=${influencerSlug}`)
            .set("Host", domain)
            .expect(302); // Redirect

        expect(response.header["set-cookie"]).toBeDefined();
        const setCookie = response.header["set-cookie"][0];
        expect(setCookie).toMatch(/kzn_visitor_id=.[^;]+/);

        const redisCount = await redis.get(`clicks:${enterpriseId}:${categoryId}`);
        expect(parseInt(redisCount || "0", 10)).toBe(1);

        const influencerCount = await redis.get(`influencer_clicks:${enterpriseId}:${influencerId}`);
        expect(parseInt(influencerCount || "0", 10)).toBe(1);
    });

    it("Visitante COM cookie: deve reaproveitar ID e NÃO contabilizar segundo clique", async () => {
        const firstResponse = await request(app)
            .get(`/links/redirect/${categoryId}`)
            .set("Host", domain)
            .expect(302);
            
        const visitorCookie = firstResponse.header["set-cookie"][0].split(";")[0]; // extract kzn_visitor_id=...

        const redisCount1 = await redis.get(`clicks:${enterpriseId}:${categoryId}`);
        expect(parseInt(redisCount1 || "0", 10)).toBe(1);

        // Segunda requisição COM o mesmo cookie
        await request(app)
            .get(`/links/redirect/${categoryId}?influencer=${influencerSlug}`)
            .set("Host", domain)
            .set("Cookie", visitorCookie) // envia o cookie
            .expect(302);

        // Contagem NÃO deve subir para a categoria
        const redisCount2 = await redis.get(`clicks:${enterpriseId}:${categoryId}`);
        expect(parseInt(redisCount2 || "0", 10)).toBe(1);

        // Contagem NÃO deve subir para o influenciador (mesmo enviando o slug agora)
        const influencerCount = await redis.get(`influencer_clicks:${enterpriseId}:${influencerId}`);
        expect(influencerCount).toBeNull(); // Nunca contabilizou influenciador para este visitante
    });

    it("Usuário AUTENTICADO: deve ignorar deduplicação, NÃO deve contabilizar clique, nem influenciador", async () => {
        const authCookie = `kzn_auth_token=${token}`;

        const response = await request(app)
            .get(`/links/redirect/${categoryId}?influencer=${influencerSlug}`)
            .set("Host", domain)
            .set("Cookie", authCookie)
            .expect(302);

        // Como é autenticado, NÃO gera visitor cookie
        expect(response.header["set-cookie"]).toBeUndefined();

        const redisCount = await redis.get(`clicks:${enterpriseId}:${categoryId}`);
        expect(redisCount).toBeNull();

        const influencerCount = await redis.get(`influencer_clicks:${enterpriseId}:${influencerId}`);
        expect(influencerCount).toBeNull();
    });

    it("Usuário com token INVÁLIDO: deve ser tratado como Visitante e contabilizar", async () => {
        const invalidAuthCookie = `kzn_auth_token=this-is-not-a-valid-jwt`;

        const response = await request(app)
            .get(`/links/redirect/${categoryId}`)
            .set("Host", domain)
            .set("Cookie", invalidAuthCookie)
            .expect(302);

        // Foi tratado como visitante: deve ter gerado um visitor cookie
        expect(response.header["set-cookie"]).toBeDefined();
        expect(response.header["set-cookie"][0]).toMatch(/kzn_visitor_id=.[^;]+/);

        // Deve ter contabilizado
        const redisCount = await redis.get(`clicks:${enterpriseId}:${categoryId}`);
        expect(parseInt(redisCount || "0", 10)).toBe(1);
    });

    it("Logout: deve enviar cabeçalho de limpeza de cookie correto", async () => {
        const response = await request(app)
            .post(`/auth/logout`)
            .set("Host", domain)
            .expect(200);

        expect(response.header["set-cookie"]).toBeDefined();
        const setCookie = response.header["set-cookie"][0];
        
        // Deve conter o nome e ser invalidado
        expect(setCookie).toContain("kzn_auth_token=;");
        expect(setCookie).toContain("Path=/");
        expect(setCookie).toContain("HttpOnly");
        // Expires na epoch indica limpeza
        expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
    });
});
