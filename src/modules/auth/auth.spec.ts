import { Request, Response, NextFunction } from "express";
import { registerCompany } from "./auth.controller";
import { registerEnterprise } from "./auth.service";
import { AppError } from "../../shared/errors/appError";
import { prisma } from "../../shared/database/prisma";
import bcrypt from "bcryptjs";

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
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: jest.Mock;
    let mockTx: any;

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
        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
            return await cb(mockTx);
        });

        jest.clearAllMocks();
    });

    describe("Controller", () => {
        it("should return 400 for invalid payload (ZodError)", async () => {
            mockReq.body.user.confirmPassword = "differentPassword";

            await registerCompany(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe("Dados inválidos");
        });

        it("should omit confirmPassword and call service", async () => {
            (bcrypt.hash as jest.Mock).mockResolvedValue("hashedPassword123");
            mockTx.role.findFirst.mockResolvedValue({ id: "role-owner-id", role: "OWNER" });
            mockTx.enterprise.create.mockResolvedValue({ id: "ent-id" });
            mockTx.user.create.mockResolvedValue({ id: "user-id" });

            await registerCompany(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({
                message: "Empresa criada com sucesso",
                data: { enterpriseId: "ent-id", userId: "user-id" }
            });

            // confirmPassword was omitted since it doesn't fail Zod and doesn't reach the DB
            // Password shouldn't be in the response
            const jsonArg = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(jsonArg.data).not.toHaveProperty("password");
        });
    });

    describe("Service", () => {
        it("should successfully register an enterprise and its OWNER user", async () => {
            (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_pwd");
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

            const result = await registerEnterprise(input);

            // Password is hashed
            expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);

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
                    roleId: "role-123"       // Points to OWNER role
                })
            });

            // Password is not returned
            expect(result).toEqual({
                message: "Empresa criada com sucesso",
                data: { enterpriseId: "ent-123", userId: "user-123" }
            });
        });

        it("should throw 500 if OWNER role does not exist", async () => {
            (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_pwd");
            mockTx.role.findFirst.mockResolvedValue(null);

            const input = {
                company: mockReq.body.company,
                user: {
                    name: "Test User",
                    email: "user@test.com",
                    password: "password123"
                }
            };

            await expect(registerEnterprise(input)).rejects.toMatchObject({
                statusCode: 500,
                message: "Internal Server Error"
            });
            
            expect(mockTx.enterprise.create).not.toHaveBeenCalled();
            expect(mockTx.user.create).not.toHaveBeenCalled();
        });

        it("should handle Prisma P2002 conflict error as 409", async () => {
            (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_pwd");
            
            const prismaP2002Error = new Error("Prisma Error");
            (prismaP2002Error as any).code = 'P2002';

            (prisma.$transaction as jest.Mock).mockRejectedValue(prismaP2002Error);

            const input = {
                company: mockReq.body.company,
                user: {
                    name: "Test User",
                    email: "user@test.com",
                    password: "password123"
                }
            };

            await expect(registerEnterprise(input)).rejects.toMatchObject({
                statusCode: 409,
                message: "Dados já cadastrados (email ou telefone)"
            });
        });

        it("should rollback transaction if user creation fails (enterprise is not committed)", async () => {
            (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_pwd");
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

            await expect(registerEnterprise(input)).rejects.toThrow("Failed to create user");
            
            // Enterprise create was called inside transaction, but since user.create threw, 
            // the whole transaction is rejected and rolls back.
            expect(mockTx.enterprise.create).toHaveBeenCalled();
            expect(mockTx.user.create).toHaveBeenCalled();
        });
    });
});
