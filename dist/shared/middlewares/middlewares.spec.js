"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const authenticate_1 = require("./authenticate");
const hasRole_1 = require("./hasRole");
const onlyUsers_1 = require("./onlyUsers");
const onlyInfluencers_1 = require("./onlyInfluencers");
const checkEnterprise_1 = require("./checkEnterprise");
const errorHandler_1 = require("./errorHandler");
const appError_1 = require("../errors/appError");
const prisma_1 = require("../database/prisma");
jest.mock("../database/prisma", () => ({
    prisma: {
        application: {
            findUnique: jest.fn()
        },
        user: {
            findUnique: jest.fn()
        },
        influencer: {
            findUnique: jest.fn()
        }
    }
}));
jest.mock("jsonwebtoken");
describe("Middlewares Layer Test Suite", () => {
    let mockReq;
    let mockRes;
    let mockNext;
    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = {
            hostname: "localhost",
            headers: {
                origin: "http://localhost:3000"
            },
            params: {},
            query: {}
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        mockNext = jest.fn();
        prisma_1.prisma.application.findUnique.mockResolvedValue({
            id: "app-id-1",
            name: "KZN",
            domain: "localhost:3000"
        });
    });
    describe("authenticate Middleware", () => {
        it("should throw 401 when Authorization header is missing", async () => {
            delete mockReq.headers;
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token não fornecido");
        });
        it("should throw 401 when token format is invalid", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer" };
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token inválido");
        });
        it("should throw 401 when JWT verification fails", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer invalidtoken" };
            jsonwebtoken_1.default.verify.mockImplementation(() => {
                throw new Error("JWT error");
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token expirado ou inválido");
        });
        it("should throw 403 when request domain is missing", async () => {
            mockReq.hostname = undefined;
            mockReq.headers = { authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: client_1.UserRole.OWNER,
                applicationId: "app-id-1"
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Aplicação não identificada.");
        });
        it("should throw 403 when application is not found for domain", async () => {
            mockReq.hostname = "unknown.com";
            mockReq.headers = { authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: client_1.UserRole.OWNER,
                applicationId: "app-id-1"
            });
            prisma_1.prisma.application.findUnique.mockResolvedValue(null);
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Aplicação não encontrada ou não autorizada.");
        });
        it("should throw 403 when token applicationId does not match current application", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: client_1.UserRole.OWNER,
                applicationId: "other-app-id"
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Acesso não permitido para esta aplicação.");
        });
        it("should throw 403 when user enterprise applicationId does not match current application", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: client_1.UserRole.OWNER,
                applicationId: "app-id-1"
            });
            prisma_1.prisma.user.findUnique.mockResolvedValue({
                id: "user-id-1",
                email: "owner@test.com",
                enterpriseId: "enterprise-id-1",
                enterprise: { applicationId: "different-app-id" },
                role: { role: client_1.UserRole.OWNER }
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Acesso não permitido para esta aplicação.");
        });
        it("should throw 403 when influencer enterprise applicationId does not match current application", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "inf-1",
                accountType: "INFLUENCER",
                applicationId: "app-id-1"
            });
            prisma_1.prisma.influencer.findUnique.mockResolvedValue({
                id: "inf-1",
                email: "inf@test.com",
                enterpriseId: "enterprise-id-1",
                enterprise: { applicationId: "different-app-id" }
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Acesso não permitido para esta aplicação.");
        });
        it("should authenticate USER with OWNER role correctly", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: client_1.UserRole.OWNER,
                applicationId: "app-id-1"
            });
            prisma_1.prisma.user.findUnique.mockResolvedValue({
                id: "user-id-1",
                email: "owner@test.com",
                enterpriseId: "enterprise-id-1",
                enterprise: { applicationId: "app-id-1" },
                role: { role: client_1.UserRole.OWNER }
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toEqual({
                id: "user-id-1",
                email: "owner@test.com",
                enterpriseId: "enterprise-id-1",
                applicationId: "app-id-1",
                accountType: "USER",
                role: client_1.UserRole.OWNER
            });
            expect(mockNext).toHaveBeenCalledWith();
        });
        it("should authenticate USER with ADMIN role correctly", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "user-id-2",
                accountType: "USER",
                role: client_1.UserRole.ADMIN,
                applicationId: "app-id-1"
            });
            prisma_1.prisma.user.findUnique.mockResolvedValue({
                id: "user-id-2",
                email: "admin@test.com",
                enterpriseId: "enterprise-id-1",
                enterprise: { applicationId: "app-id-1" },
                role: { role: client_1.UserRole.ADMIN }
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toEqual({
                id: "user-id-2",
                email: "admin@test.com",
                enterpriseId: "enterprise-id-1",
                applicationId: "app-id-1",
                accountType: "USER",
                role: client_1.UserRole.ADMIN
            });
            expect(mockNext).toHaveBeenCalledWith();
        });
        it("should authenticate INFLUENCER correctly without user role", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "influencer-id-1",
                accountType: "INFLUENCER",
                applicationId: "app-id-1"
            });
            prisma_1.prisma.influencer.findUnique.mockResolvedValue({
                id: "influencer-id-1",
                email: "influencer@test.com",
                enterpriseId: "enterprise-id-1",
                enterprise: { applicationId: "app-id-1" }
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toEqual({
                id: "influencer-id-1",
                email: "influencer@test.com",
                enterpriseId: "enterprise-id-1",
                applicationId: "app-id-1",
                accountType: "INFLUENCER"
            });
            expect(mockNext).toHaveBeenCalledWith();
        });
        it("should throw 401 when user is not found in database", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "non-existent",
                accountType: "USER",
                applicationId: "app-id-1"
            });
            prisma_1.prisma.user.findUnique.mockResolvedValue(null);
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Usuário não encontrado");
        });
        describe("Multi-Tenant Isolation (KZN ↔ Alecio)", () => {
            it("should pass when KZN JWT accesses KZN domain", async () => {
                // (prisma.application.findUnique as jest.Mock) already returns KZN by default
                mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
                jsonwebtoken_1.default.verify.mockReturnValue({
                    sub: "kzn-user-1",
                    accountType: "USER",
                    role: client_1.UserRole.OWNER,
                    applicationId: "app-id-1" // KZN
                });
                prisma_1.prisma.user.findUnique.mockResolvedValue({
                    id: "kzn-user-1",
                    email: "kzn@test.com",
                    enterpriseId: "kzn-ent-1",
                    enterprise: { applicationId: "app-id-1" },
                    role: { role: client_1.UserRole.OWNER }
                });
                await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
                expect(mockNext).toHaveBeenCalledWith(); // Passes
            });
            it("should throw 403 when KZN JWT accesses Alecio domain", async () => {
                prisma_1.prisma.application.findUnique.mockResolvedValue({
                    id: "app-id-2", // Alecio
                    name: "Alecio",
                    domain: "alecio.com"
                });
                mockReq.hostname = "alecio.com";
                mockReq.headers = { authorization: "Bearer validtoken" };
                jsonwebtoken_1.default.verify.mockReturnValue({
                    sub: "kzn-user-1",
                    accountType: "USER",
                    role: client_1.UserRole.OWNER,
                    applicationId: "app-id-1" // KZN
                });
                await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
            });
            it("should pass when Alecio JWT accesses Alecio domain", async () => {
                prisma_1.prisma.application.findUnique.mockResolvedValue({
                    id: "app-id-2", // Alecio
                    name: "Alecio",
                    domain: "alecio.com"
                });
                mockReq.hostname = "alecio.com";
                mockReq.headers = { authorization: "Bearer validtoken" };
                jsonwebtoken_1.default.verify.mockReturnValue({
                    sub: "alecio-user-1",
                    accountType: "USER",
                    role: client_1.UserRole.OWNER,
                    applicationId: "app-id-2" // Alecio
                });
                prisma_1.prisma.user.findUnique.mockResolvedValue({
                    id: "alecio-user-1",
                    email: "alecio@test.com",
                    enterpriseId: "alecio-ent-1",
                    enterprise: { applicationId: "app-id-2" },
                    role: { role: client_1.UserRole.OWNER }
                });
                await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
                expect(mockNext).toHaveBeenCalledWith(); // Passes
            });
            it("should throw 403 when Alecio JWT accesses KZN domain", async () => {
                // mockReq.hostname is "localhost" (KZN) by default
                mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
                jsonwebtoken_1.default.verify.mockReturnValue({
                    sub: "alecio-user-1",
                    accountType: "USER",
                    role: client_1.UserRole.OWNER,
                    applicationId: "app-id-2" // Alecio
                });
                await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
            });
            it("should throw 403 when JWT is valid but Application does not exist", async () => {
                mockReq.hostname = "unknown.com";
                mockReq.headers = { authorization: "Bearer validtoken" };
                jsonwebtoken_1.default.verify.mockReturnValue({
                    sub: "kzn-user-1",
                    accountType: "USER",
                    role: client_1.UserRole.OWNER,
                    applicationId: "app-id-1"
                });
                prisma_1.prisma.application.findUnique.mockResolvedValue(null);
                await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
            });
            it("should throw 401 when JWT is invalid or expired", async () => {
                mockReq.headers = { authorization: "Bearer invalidtoken" };
                jsonwebtoken_1.default.verify.mockImplementation(() => {
                    throw new Error("JWT error");
                });
                await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(401);
            });
            it("should throw 403 when Origin is forged (Origin: Tenant B, JWT: Tenant A)", async () => {
                prisma_1.prisma.application.findUnique.mockResolvedValue({
                    id: "app-id-2", // Alecio (Tenant B)
                    name: "Alecio",
                    domain: "alecio.com"
                });
                // Forjando o Origin para tentar acessar o Tenant B
                mockReq.headers = { origin: "https://alecio.com", authorization: "Bearer validtoken" };
                jsonwebtoken_1.default.verify.mockReturnValue({
                    sub: "kzn-user-1",
                    accountType: "USER",
                    role: client_1.UserRole.OWNER,
                    applicationId: "app-id-1" // JWT pertence à KZN (Tenant A)
                });
                await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
                expect(error.message).toBe("Acesso não permitido para esta aplicação.");
            });
            it("should throw 403 when Origin is forged (Origin: Tenant A, JWT: Tenant B)", async () => {
                prisma_1.prisma.application.findUnique.mockResolvedValue({
                    id: "app-id-1", // KZN (Tenant A)
                    name: "KZN",
                    domain: "kzn.com"
                });
                // Forjando o Origin para tentar acessar o Tenant A
                mockReq.headers = { origin: "https://kzn.com", authorization: "Bearer validtoken" };
                jsonwebtoken_1.default.verify.mockReturnValue({
                    sub: "alecio-user-1",
                    accountType: "USER",
                    role: client_1.UserRole.OWNER,
                    applicationId: "app-id-2" // JWT pertence à Alecio (Tenant B)
                });
                await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
                expect(error.message).toBe("Acesso não permitido para esta aplicação.");
            });
            it("should throw 403 when JWT is valid KZN but Enterprise belongs to Alecio (Cross-Enterprise Hijack)", async () => {
                mockReq.headers = { authorization: "Bearer validtoken" };
                jsonwebtoken_1.default.verify.mockReturnValue({
                    sub: "hijacker-user",
                    accountType: "USER",
                    role: client_1.UserRole.OWNER,
                    applicationId: "app-id-1" // KZN
                });
                prisma_1.prisma.user.findUnique.mockResolvedValue({
                    id: "hijacker-user",
                    enterpriseId: "alecio-ent-1",
                    enterprise: { applicationId: "app-id-2" }, // Belongs to Alecio
                    role: { role: client_1.UserRole.OWNER }
                });
                await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
            });
            it("should throw 403 when Enterprise applicationId is null (not yet migrated)", async () => {
                mockReq.headers = { authorization: "Bearer validtoken" };
                jsonwebtoken_1.default.verify.mockReturnValue({
                    sub: "legacy-user",
                    accountType: "USER",
                    role: client_1.UserRole.OWNER,
                    applicationId: "app-id-1" // KZN
                });
                prisma_1.prisma.user.findUnique.mockResolvedValue({
                    id: "legacy-user",
                    enterpriseId: "legacy-ent-1",
                    enterprise: { applicationId: null }, // Null
                    role: { role: client_1.UserRole.OWNER }
                });
                await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
            });
        });
    });
    describe("hasRole Middleware", () => {
        it("should throw 401 when req.user is undefined", () => {
            const middleware = (0, hasRole_1.hasRole)(client_1.UserRole.OWNER, client_1.UserRole.ADMIN);
            middleware(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
        });
        it("should throw 403 when accountType is INFLUENCER", () => {
            mockReq.user = {
                id: "inf-1",
                email: "inf@test.com",
                enterpriseId: "ent-1",
                accountType: "INFLUENCER"
            };
            const middleware = (0, hasRole_1.hasRole)(client_1.UserRole.OWNER, client_1.UserRole.ADMIN);
            middleware(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
        });
        it("should allow OWNER when both OWNER and ADMIN are allowed", () => {
            mockReq.user = {
                id: "u-1",
                email: "owner@test.com",
                enterpriseId: "ent-1",
                accountType: "USER",
                role: client_1.UserRole.OWNER
            };
            const middleware = (0, hasRole_1.hasRole)(client_1.UserRole.OWNER, client_1.UserRole.ADMIN);
            middleware(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });
        it("should allow ADMIN when both OWNER and ADMIN are allowed", () => {
            mockReq.user = {
                id: "u-2",
                email: "admin@test.com",
                enterpriseId: "ent-1",
                accountType: "USER",
                role: client_1.UserRole.ADMIN
            };
            const middleware = (0, hasRole_1.hasRole)(client_1.UserRole.OWNER, client_1.UserRole.ADMIN);
            middleware(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });
        it("should reject ADMIN when only OWNER is required", () => {
            mockReq.user = {
                id: "u-2",
                email: "admin@test.com",
                enterpriseId: "ent-1",
                accountType: "USER",
                role: client_1.UserRole.ADMIN
            };
            const middleware = (0, hasRole_1.hasRole)(client_1.UserRole.OWNER);
            middleware(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
        });
    });
    describe("onlyUsers Middleware", () => {
        it("should pass for accountType USER", () => {
            mockReq.user = {
                id: "u-1",
                email: "user@test.com",
                enterpriseId: "ent-1",
                accountType: "USER",
                role: client_1.UserRole.ADMIN
            };
            (0, onlyUsers_1.onlyUsers)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });
        it("should reject for accountType INFLUENCER", () => {
            mockReq.user = {
                id: "i-1",
                email: "inf@test.com",
                enterpriseId: "ent-1",
                accountType: "INFLUENCER"
            };
            (0, onlyUsers_1.onlyUsers)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
        });
    });
    describe("onlyInfluencers Middleware", () => {
        it("should pass for accountType INFLUENCER", () => {
            mockReq.user = {
                id: "i-1",
                email: "inf@test.com",
                enterpriseId: "ent-1",
                accountType: "INFLUENCER"
            };
            (0, onlyInfluencers_1.onlyInfluencers)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });
        it("should reject for accountType USER", () => {
            mockReq.user = {
                id: "u-1",
                email: "user@test.com",
                enterpriseId: "ent-1",
                accountType: "USER",
                role: client_1.UserRole.OWNER
            };
            (0, onlyInfluencers_1.onlyInfluencers)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
        });
    });
    describe("checkEnterprise Middleware", () => {
        it("should pass when target enterprise matches user enterprise", () => {
            mockReq.user = {
                id: "u-1",
                email: "owner@test.com",
                enterpriseId: "ent-100",
                accountType: "USER",
                role: client_1.UserRole.OWNER
            };
            mockReq.params = { enterpriseId: "ent-100" };
            (0, checkEnterprise_1.checkEnterprise)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });
        it("should throw 403 when user attempts to access a different enterprise", () => {
            mockReq.user = {
                id: "u-1",
                email: "owner@test.com",
                enterpriseId: "ent-100",
                accountType: "USER",
                role: client_1.UserRole.OWNER
            };
            mockReq.params = { enterpriseId: "ent-999" };
            (0, checkEnterprise_1.checkEnterprise)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Acesso negado");
        });
    });
    describe("errorHandler Middleware", () => {
        it("should handle AppError with custom statusCode and message", () => {
            const err = new appError_1.AppError("Acesso não autorizado", 401);
            (0, errorHandler_1.errorHandler)(err, mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: "Acesso não autorizado" });
        });
        it("should handle AppError(400) Bad Request", () => {
            const err = new appError_1.AppError("Dados inválidos", 400);
            (0, errorHandler_1.errorHandler)(err, mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: "Dados inválidos" });
        });
        it("should handle unexpected errors with HTTP 500 and not expose stack trace", () => {
            const err = new Error("Database connection crash with secret internal trace");
            (0, errorHandler_1.errorHandler)(err, mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: "Erro interno do servidor" });
            const jsonArg = mockRes.json.mock.calls[0][0];
            expect(jsonArg).not.toHaveProperty("stack");
            expect(jsonArg).not.toHaveProperty("trace");
        });
    });
});
