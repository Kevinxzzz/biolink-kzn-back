"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const appError_1 = require("../../shared/errors/appError");
const prisma_1 = require("../../shared/database/prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
jest.mock("../../shared/database/prisma", () => ({
    prisma: {
        $transaction: jest.fn()
    }
}));
jest.mock("bcryptjs", () => ({
    hash: jest.fn(),
    compare: jest.fn()
}));
describe("Auth Module - Register Enterprise", () => {
    let mockReq;
    let mockRes;
    let mockNext;
    let mockTx;
    beforeEach(() => {
        mockReq = {
            body: {
                company: {
                    name: "Test Company",
                    email: "company@test.com",
                    phone: "(11) 99999-9999"
                },
                user: {
                    name: "Test User",
                    email: "user@test.com",
                    password: "password123",
                    confirmPassword: "password123"
                }
            }
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        mockNext = jest.fn();
        mockTx = {
            role: { findFirst: jest.fn() },
            enterprise: { create: jest.fn() },
            user: { create: jest.fn() }
        };
        // Default successful transaction execution
        prisma_1.prisma.$transaction.mockImplementation(async (cb) => {
            return await cb(mockTx);
        });
        jest.clearAllMocks();
    });
    describe("Controller", () => {
        it("should return 400 for invalid payload (ZodError)", async () => {
            mockReq.body.user.confirmPassword = "differentPassword";
            await (0, auth_controller_1.registerCompany)(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(appError_1.AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe("Dados inválidos");
        });
        it("should omit confirmPassword and call service", async () => {
            bcryptjs_1.default.hash.mockResolvedValue("hashedPassword123");
            mockTx.role.findFirst.mockResolvedValue({ id: "role-owner-id", role: "OWNER" });
            mockTx.enterprise.create.mockResolvedValue({ id: "ent-id" });
            mockTx.user.create.mockResolvedValue({ id: "user-id" });
            await (0, auth_controller_1.registerCompany)(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({
                message: "Empresa criada com sucesso",
                data: { enterpriseId: "ent-id", userId: "user-id" }
            });
            // confirmPassword was omitted since it doesn't fail Zod and doesn't reach the DB
            // Password shouldn't be in the response
            const jsonArg = mockRes.json.mock.calls[0][0];
            expect(jsonArg.data).not.toHaveProperty("password");
        });
    });
    describe("Service", () => {
        it("should successfully register an enterprise and its OWNER user", async () => {
            bcryptjs_1.default.hash.mockResolvedValue("hashed_pwd");
            mockTx.role.findFirst.mockResolvedValue({ id: "role-123", role: "OWNER" });
            mockTx.enterprise.create.mockResolvedValue({ id: "ent-123" });
            mockTx.user.create.mockResolvedValue({ id: "user-123" });
            const input = {
                company: mockReq.body.company,
                user: {
                    name: "Test User",
                    email: "user@test.com",
                    password: "password123"
                }
            };
            const result = await (0, auth_service_1.registerEnterprise)(input);
            // Password is hashed
            expect(bcryptjs_1.default.hash).toHaveBeenCalledWith("password123", 10);
            // Transaction operations
            expect(mockTx.role.findFirst).toHaveBeenCalledWith({ where: { role: "OWNER" } });
            // Enterprise created
            expect(mockTx.enterprise.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    name: "Test Company",
                    email: "company@test.com",
                    phoneNumber: "(11) 99999-9999"
                })
            });
            // User created with correct relationships and hashed password
            expect(mockTx.user.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    name: "Test User",
                    email: "user@test.com",
                    password: "hashed_pwd",
                    enterpriseId: "ent-123", // Points to created enterprise
                    roleId: "role-123" // Points to OWNER role
                })
            });
            // Password is not returned
            expect(result).toEqual({
                message: "Empresa criada com sucesso",
                data: { enterpriseId: "ent-123", userId: "user-123" }
            });
        });
        it("should throw 500 if OWNER role does not exist", async () => {
            bcryptjs_1.default.hash.mockResolvedValue("hashed_pwd");
            mockTx.role.findFirst.mockResolvedValue(null);
            const input = {
                company: mockReq.body.company,
                user: {
                    name: "Test User",
                    email: "user@test.com",
                    password: "password123"
                }
            };
            await expect((0, auth_service_1.registerEnterprise)(input)).rejects.toMatchObject({
                statusCode: 500,
                message: "Internal Server Error"
            });
            expect(mockTx.enterprise.create).not.toHaveBeenCalled();
            expect(mockTx.user.create).not.toHaveBeenCalled();
        });
        it("should handle Prisma P2002 conflict error as 409", async () => {
            bcryptjs_1.default.hash.mockResolvedValue("hashed_pwd");
            const prismaP2002Error = new Error("Prisma Error");
            prismaP2002Error.code = 'P2002';
            prisma_1.prisma.$transaction.mockRejectedValue(prismaP2002Error);
            const input = {
                company: mockReq.body.company,
                user: {
                    name: "Test User",
                    email: "user@test.com",
                    password: "password123"
                }
            };
            await expect((0, auth_service_1.registerEnterprise)(input)).rejects.toMatchObject({
                statusCode: 409,
                message: "Dados já cadastrados (email ou telefone)"
            });
        });
        it("should rollback transaction if user creation fails (enterprise is not committed)", async () => {
            bcryptjs_1.default.hash.mockResolvedValue("hashed_pwd");
            mockTx.role.findFirst.mockResolvedValue({ id: "role-123", role: "OWNER" });
            mockTx.enterprise.create.mockResolvedValue({ id: "ent-123" });
            const genericError = new Error("Failed to create user");
            mockTx.user.create.mockRejectedValue(genericError);
            const input = {
                company: mockReq.body.company,
                user: {
                    name: "Test User",
                    email: "user@test.com",
                    password: "password123"
                }
            };
            await expect((0, auth_service_1.registerEnterprise)(input)).rejects.toThrow("Failed to create user");
            // Enterprise create was called inside transaction, but since user.create threw, 
            // the whole transaction is rejected and rolls back.
            expect(mockTx.enterprise.create).toHaveBeenCalled();
            expect(mockTx.user.create).toHaveBeenCalled();
        });
    });
});
