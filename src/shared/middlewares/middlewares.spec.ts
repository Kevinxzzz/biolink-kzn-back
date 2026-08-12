import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { authenticate } from "./authenticate";
import { hasRole } from "./hasRole";
import { onlyUsers } from "./onlyUsers";
import { onlyInfluencers } from "./onlyInfluencers";
import { checkEnterprise } from "./checkEnterprise";
import { AppError } from "../errors/appError";
import { prisma } from "../database/prisma";
import { env } from "../config/env";

jest.mock("../database/prisma", () => ({
    prisma: {
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
        mockReq = {
            headers: {},
            params: {},
            query: {}
        };
        mockRes = {};
        mockNext = jest.fn();
        jest.clearAllMocks();
    });

    describe("authenticate Middleware", () => {
        it("should throw 401 when Authorization header is missing", async () => {
            await authenticate(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token não fornecido");
        });

        it("should throw 401 when token format is invalid", async () => {
            mockReq.headers = { authorization: "Bearer" };
            await authenticate(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token inválido");
        });

        it("should throw 401 when JWT verification fails", async () => {
            mockReq.headers = { authorization: "Bearer invalidtoken" };
            (jwt.verify as jest.Mock).mockImplementation(() => {
                throw new Error("JWT error");
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token expirado ou inválido");
        });

        it("should authenticate USER with OWNER role correctly", async () => {
            mockReq.headers = { authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: UserRole.OWNER
            });

            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: "user-id-1",
                email: "owner@test.com",
                enterpriseId: "enterprise-id-1",
                role: { role: UserRole.OWNER }
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);

            expect(mockReq.user).toEqual({
                id: "user-id-1",
                email: "owner@test.com",
                enterpriseId: "enterprise-id-1",
                accountType: "USER",
                role: UserRole.OWNER
            });
            expect(mockNext).toHaveBeenCalledWith();
        });

        it("should authenticate USER with ADMIN role correctly", async () => {
            mockReq.headers = { authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "user-id-2",
                accountType: "USER",
                role: UserRole.ADMIN
            });

            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: "user-id-2",
                email: "admin@test.com",
                enterpriseId: "enterprise-id-1",
                role: { role: UserRole.ADMIN }
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);

            expect(mockReq.user).toEqual({
                id: "user-id-2",
                email: "admin@test.com",
                enterpriseId: "enterprise-id-1",
                accountType: "USER",
                role: UserRole.ADMIN
            });
            expect(mockNext).toHaveBeenCalledWith();
        });

        it("should authenticate INFLUENCER correctly without user role", async () => {
            mockReq.headers = { authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "influencer-id-1",
                accountType: "INFLUENCER"
            });

            (prisma.influencer.findUnique as jest.Mock).mockResolvedValue({
                id: "influencer-id-1",
                email: "influencer@test.com",
                enterpriseId: "enterprise-id-1"
            });

            await authenticate(mockReq as Request, mockRes as Response, mockNext);

            expect(mockReq.user).toEqual({
                id: "influencer-id-1",
                email: "influencer@test.com",
                enterpriseId: "enterprise-id-1",
                accountType: "INFLUENCER"
            });
            expect(mockNext).toHaveBeenCalledWith();
        });

        it("should throw 401 when user is not found in database", async () => {
            mockReq.headers = { authorization: "Bearer validtoken" };
            (jwt.verify as jest.Mock).mockReturnValue({
                sub: "non-existent",
                accountType: "USER"
            });
            (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

            await authenticate(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Usuário não encontrado");
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
});
