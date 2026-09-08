import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { authenticate } from "./authenticate";
import { hasRole } from "./hasRole";
import { onlyUsers } from "./onlyUsers";
import { onlyInfluencers } from "./onlyInfluencers";
import { checkEnterprise } from "./checkEnterprise";
import { errorHandler } from "./errorHandler";
import { AppError } from "../errors/appError";
import { prisma } from "../database/prisma";
import { env } from "../config/env";

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
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: jest.Mock;

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

        (prisma.application.findUnique as jest.Mock).mockResolvedValue({
            id: "app-id-1",
            name: "KZN",
            domain: "localhost:3000"
        });
    });

    describe("authenticate Middleware", () => {
        it("should throw 401 when Authorization header is missing", async () => {
            delete mockReq.headers;
            await authenticate(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token não fornecido");
        });

        it("should throw 401 when token format is invalid", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer" };
            await authenticate(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token inválido");
        });

        it("should throw 401 when JWT verification fails", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer invalidtoken" };
            (jwt.verify as jest.Mock).mockImplementation(() => {
                throw new Error("JWT error");
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token expirado ou inválido");
        });

        it("should throw 403 when request domain is missing", async () => {
            (mockReq as any).hostname = undefined;
            mockReq.headers = { authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: UserRole.OWNER,
                applicationId: "app-id-1"
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Aplicação não identificada.");
        });

        it("should throw 403 when application is not found for domain", async () => {
            (mockReq as any).hostname = "unknown.com";
            mockReq.headers = { authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: UserRole.OWNER,
                applicationId: "app-id-1"
            });
            (prisma.application.findUnique as jest.Mock).mockResolvedValue(null);

            await authenticate(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Aplicação não encontrada ou não autorizada.");
        });

        it("should throw 403 when token applicationId does not match current application", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: UserRole.OWNER,
                applicationId: "other-app-id"
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Acesso não permitido para esta aplicação.");
        });

        it("should throw 403 when user enterprise applicationId does not match current application", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: UserRole.OWNER,
                applicationId: "app-id-1"
            });
            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: "user-id-1",
                email: "owner@test.com",
                enterpriseId: "enterprise-id-1",
                enterprise: { applicationId: "different-app-id" },
                role: { role: UserRole.OWNER }
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Acesso não permitido para esta aplicação.");
        });

        it("should throw 403 when influencer enterprise applicationId does not match current application", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "inf-1",
                accountType: "INFLUENCER",
                applicationId: "app-id-1"
            });
            (prisma.influencer.findUnique as jest.Mock).mockResolvedValue({
                id: "inf-1",
                email: "inf@test.com",
                enterpriseId: "enterprise-id-1",
                enterprise: { applicationId: "different-app-id" }
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Acesso não permitido para esta aplicação.");
        });

        it("should authenticate USER with OWNER role correctly", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: UserRole.OWNER,
                applicationId: "app-id-1"
            });

            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: "user-id-1",
                email: "owner@test.com",
                enterpriseId: "enterprise-id-1",
                enterprise: { applicationId: "app-id-1" },
                role: { role: UserRole.OWNER }
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);

            expect(mockReq.user).toEqual({
                id: "user-id-1",
                email: "owner@test.com",
                enterpriseId: "enterprise-id-1",
                applicationId: "app-id-1",
                accountType: "USER",
                role: UserRole.OWNER
            });
            expect(mockNext).toHaveBeenCalledWith();
        });

        it("should authenticate USER with ADMIN role correctly", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "user-id-2",
                accountType: "USER",
                role: UserRole.ADMIN,
                applicationId: "app-id-1"
            });

            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: "user-id-2",
                email: "admin@test.com",
                enterpriseId: "enterprise-id-1",
                enterprise: { applicationId: "app-id-1" },
                role: { role: UserRole.ADMIN }
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);

            expect(mockReq.user).toEqual({
                id: "user-id-2",
                email: "admin@test.com",
                enterpriseId: "enterprise-id-1",
                applicationId: "app-id-1",
                accountType: "USER",
                role: UserRole.ADMIN
            });
            expect(mockNext).toHaveBeenCalledWith();
        });

        it("should authenticate INFLUENCER correctly without user role", async () => {
            mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "influencer-id-1",
                accountType: "INFLUENCER",
                applicationId: "app-id-1"
            });

            (prisma.influencer.findUnique as jest.Mock).mockResolvedValue({
                id: "influencer-id-1",
                email: "influencer@test.com",
                enterpriseId: "enterprise-id-1",
                enterprise: { applicationId: "app-id-1" }
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);

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
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "non-existent",
                accountType: "USER",
                applicationId: "app-id-1"
            });
            (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

            await authenticate(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Usuário não encontrado");
        });

        describe("Multi-Tenant Isolation (KZN ↔ Alecio)", () => {
            it("should pass when KZN JWT accesses KZN domain", async () => {
                // (prisma.application.findUnique as jest.Mock) already returns KZN by default
                mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
                (jwt.verify as jest.Mock).mockReturnValue({
                    sub: "kzn-user-1",
                    accountType: "USER",
                    role: UserRole.OWNER,
                    applicationId: "app-id-1" // KZN
                });
                (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                    id: "kzn-user-1",
                    email: "kzn@test.com",
                    enterpriseId: "kzn-ent-1",
                    enterprise: { applicationId: "app-id-1" },
                    role: { role: UserRole.OWNER }
                });

                await authenticate(mockReq as Request, mockRes as Response, mockNext);
                expect(mockNext).toHaveBeenCalledWith(); // Passes
            });

            it("should throw 403 when KZN JWT accesses Alecio domain", async () => {
                (prisma.application.findUnique as jest.Mock).mockResolvedValue({
                    id: "app-id-2", // Alecio
                    name: "Alecio",
                    domain: "alecio.com"
                });
                (mockReq as any).hostname = "alecio.com";
                mockReq.headers = { authorization: "Bearer validtoken" };
                
                (jwt.verify as jest.Mock).mockReturnValue({
                    sub: "kzn-user-1",
                    accountType: "USER",
                    role: UserRole.OWNER,
                    applicationId: "app-id-1" // KZN
                });

                await authenticate(mockReq as Request, mockRes as Response, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
            });

            it("should pass when Alecio JWT accesses Alecio domain", async () => {
                (prisma.application.findUnique as jest.Mock).mockResolvedValue({
                    id: "app-id-2", // Alecio
                    name: "Alecio",
                    domain: "alecio.com"
                });
                (mockReq as any).hostname = "alecio.com";
                mockReq.headers = { authorization: "Bearer validtoken" };
                
                (jwt.verify as jest.Mock).mockReturnValue({
                    sub: "alecio-user-1",
                    accountType: "USER",
                    role: UserRole.OWNER,
                    applicationId: "app-id-2" // Alecio
                });
                (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                    id: "alecio-user-1",
                    email: "alecio@test.com",
                    enterpriseId: "alecio-ent-1",
                    enterprise: { applicationId: "app-id-2" },
                    role: { role: UserRole.OWNER }
                });

                await authenticate(mockReq as Request, mockRes as Response, mockNext);
                expect(mockNext).toHaveBeenCalledWith(); // Passes
            });

            it("should throw 403 when Alecio JWT accesses KZN domain", async () => {
                // mockReq.hostname is "localhost" (KZN) by default
                mockReq.headers = { origin: "http://localhost:3000", authorization: "Bearer validtoken" };
                (jwt.verify as jest.Mock).mockReturnValue({
                    sub: "alecio-user-1",
                    accountType: "USER",
                    role: UserRole.OWNER,
                    applicationId: "app-id-2" // Alecio
                });

                await authenticate(mockReq as Request, mockRes as Response, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
            });

            it("should throw 403 when JWT is valid but Application does not exist", async () => {
                (mockReq as any).hostname = "unknown.com";
                mockReq.headers = { authorization: "Bearer validtoken" };
                (jwt.verify as jest.Mock).mockReturnValue({
                    sub: "kzn-user-1",
                    accountType: "USER",
                    role: UserRole.OWNER,
                    applicationId: "app-id-1"
                });
                (prisma.application.findUnique as jest.Mock).mockResolvedValue(null);

                await authenticate(mockReq as Request, mockRes as Response, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
            });

            it("should throw 401 when JWT is invalid or expired", async () => {
                mockReq.headers = { authorization: "Bearer invalidtoken" };
                (jwt.verify as jest.Mock).mockImplementation(() => {
                    throw new Error("JWT error");
                });

                await authenticate(mockReq as Request, mockRes as Response, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(401);
            });

            it("should throw 403 when JWT is valid KZN but Enterprise belongs to Alecio (Cross-Enterprise Hijack)", async () => {
                mockReq.headers = { authorization: "Bearer validtoken" };
                (jwt.verify as jest.Mock).mockReturnValue({
                    sub: "hijacker-user",
                    accountType: "USER",
                    role: UserRole.OWNER,
                    applicationId: "app-id-1" // KZN
                });
                (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                    id: "hijacker-user",
                    enterpriseId: "alecio-ent-1",
                    enterprise: { applicationId: "app-id-2" }, // Belongs to Alecio
                    role: { role: UserRole.OWNER }
                });

                await authenticate(mockReq as Request, mockRes as Response, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
            });

            it("should throw 403 when Enterprise applicationId is null (not yet migrated)", async () => {
                mockReq.headers = { authorization: "Bearer validtoken" };
                (jwt.verify as jest.Mock).mockReturnValue({
                    sub: "legacy-user",
                    accountType: "USER",
                    role: UserRole.OWNER,
                    applicationId: "app-id-1" // KZN
                });
                (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                    id: "legacy-user",
                    enterpriseId: "legacy-ent-1",
                    enterprise: { applicationId: null }, // Null
                    role: { role: UserRole.OWNER }
                });

                await authenticate(mockReq as Request, mockRes as Response, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
                const error = mockNext.mock.calls[0][0];
                expect(error.statusCode).toBe(403);
            });
        });
    });

    describe("hasRole Middleware", () => {
        it("should throw 401 when req.user is undefined", () => {
            const middleware = hasRole(UserRole.OWNER, UserRole.ADMIN);
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
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

            const middleware = hasRole(UserRole.OWNER, UserRole.ADMIN);
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
        });

        it("should allow OWNER when both OWNER and ADMIN are allowed", () => {
            mockReq.user = {
                id: "u-1",
                email: "owner@test.com",
                enterpriseId: "ent-1",
                accountType: "USER",
                role: UserRole.OWNER
            };

            const middleware = hasRole(UserRole.OWNER, UserRole.ADMIN);
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
        });

        it("should allow ADMIN when both OWNER and ADMIN are allowed", () => {
            mockReq.user = {
                id: "u-2",
                email: "admin@test.com",
                enterpriseId: "ent-1",
                accountType: "USER",
                role: UserRole.ADMIN
            };

            const middleware = hasRole(UserRole.OWNER, UserRole.ADMIN);
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
        });

        it("should reject ADMIN when only OWNER is required", () => {
            mockReq.user = {
                id: "u-2",
                email: "admin@test.com",
                enterpriseId: "ent-1",
                accountType: "USER",
                role: UserRole.ADMIN
            };

            const middleware = hasRole(UserRole.OWNER);
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
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
                role: UserRole.ADMIN
            };

            onlyUsers(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });

        it("should reject for accountType INFLUENCER", () => {
            mockReq.user = {
                id: "i-1",
                email: "inf@test.com",
                enterpriseId: "ent-1",
                accountType: "INFLUENCER"
            };

            onlyUsers(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
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

            onlyInfluencers(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });

        it("should reject for accountType USER", () => {
            mockReq.user = {
                id: "u-1",
                email: "user@test.com",
                enterpriseId: "ent-1",
                accountType: "USER",
                role: UserRole.OWNER
            };

            onlyInfluencers(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
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
                role: UserRole.OWNER
            };
            mockReq.params = { enterpriseId: "ent-100" };

            checkEnterprise(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });

        it("should throw 403 when user attempts to access a different enterprise", () => {
            mockReq.user = {
                id: "u-1",
                email: "owner@test.com",
                enterpriseId: "ent-100",
                accountType: "USER",
                role: UserRole.OWNER
            };
            mockReq.params = { enterpriseId: "ent-999" };

            checkEnterprise(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe("Acesso negado");
        });
    });

    describe("errorHandler Middleware", () => {
        it("should handle AppError with custom statusCode and message", () => {
            const err = new AppError("Acesso não autorizado", 401);
            errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ message: "Acesso não autorizado" });
        });

        it("should handle AppError(400) Bad Request", () => {
            const err = new AppError("Dados inválidos", 400);
            errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: "Dados inválidos" });
        });

        it("should handle unexpected errors with HTTP 500 and not expose stack trace", () => {
            const err = new Error("Database connection crash with secret internal trace");
            errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ message: "Erro interno do servidor" });
            const jsonArg = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(jsonArg).not.toHaveProperty("stack");
            expect(jsonArg).not.toHaveProperty("trace");
        });
    });
});
