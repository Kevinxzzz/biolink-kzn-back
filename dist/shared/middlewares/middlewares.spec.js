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
const appError_1 = require("../errors/appError");
const prisma_1 = require("../database/prisma");
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
    let mockReq;
    let mockRes;
    let mockNext;
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
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token não fornecido");
        });
        it("should throw 401 when token format is invalid", async () => {
            mockReq.headers = { authorization: "Bearer" };
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token inválido");
        });
        it("should throw 401 when JWT verification fails", async () => {
            mockReq.headers = { authorization: "Bearer invalidtoken" };
            jsonwebtoken_1.default.verify.mockImplementation(() => {
                throw new Error("JWT error");
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Token expirado ou inválido");
        });
        it("should authenticate USER with OWNER role correctly", async () => {
            mockReq.headers = { authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "user-id-1",
                accountType: "USER",
                role: client_1.UserRole.OWNER
            });
            prisma_1.prisma.user.findUnique.mockResolvedValue({
                id: "user-id-1",
                email: "owner@test.com",
                enterpriseId: "enterprise-id-1",
                role: { role: client_1.UserRole.OWNER }
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toEqual({
                id: "user-id-1",
                email: "owner@test.com",
                enterpriseId: "enterprise-id-1",
                accountType: "USER",
                role: client_1.UserRole.OWNER
            });
            expect(mockNext).toHaveBeenCalledWith();
        });
        it("should authenticate USER with ADMIN role correctly", async () => {
            mockReq.headers = { authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "user-id-2",
                accountType: "USER",
                role: client_1.UserRole.ADMIN
            });
            prisma_1.prisma.user.findUnique.mockResolvedValue({
                id: "user-id-2",
                email: "admin@test.com",
                enterpriseId: "enterprise-id-1",
                role: { role: client_1.UserRole.ADMIN }
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toEqual({
                id: "user-id-2",
                email: "admin@test.com",
                enterpriseId: "enterprise-id-1",
                accountType: "USER",
                role: client_1.UserRole.ADMIN
            });
            expect(mockNext).toHaveBeenCalledWith();
        });
        it("should authenticate INFLUENCER correctly without user role", async () => {
            mockReq.headers = { authorization: "Bearer validtoken" };
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "influencer-id-1",
                accountType: "INFLUENCER"
            });
            prisma_1.prisma.influencer.findUnique.mockResolvedValue({
                id: "influencer-id-1",
                email: "influencer@test.com",
                enterpriseId: "enterprise-id-1"
            });
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
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
            jsonwebtoken_1.default.verify.mockReturnValue({
                sub: "non-existent",
                accountType: "USER"
            });
            prisma_1.prisma.user.findUnique.mockResolvedValue(null);
            await (0, authenticate_1.authenticate)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe("Usuário não encontrado");
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
});
