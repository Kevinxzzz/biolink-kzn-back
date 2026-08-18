import { Request, Response, NextFunction } from "express";
import { login, registerCompany } from "./auth.controller";
import { loginIn, registerEnterprise } from "./auth.service";
import { AppError } from "../../shared/errors/appError";
import { prisma } from "../../shared/database/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";

jest.mock("../../shared/database/prisma", () => ({
    prisma: {
        $transaction: jest.fn(),
        user: {
            findFirst: jest.fn()
        },
        enterprise: {
            findFirst: jest.fn()
        }
    }
}));

jest.mock("bcryptjs", () => ({
    hash: jest.fn(),
    compare: jest.fn()
}));

jest.mock("jsonwebtoken", () => ({
    sign: jest.fn()
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
            expect(error.message).toBe("Os dados informados são inválidos.");
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

            expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
            expect(mockTx.role.findFirst).toHaveBeenCalledWith({ where: { role: "OWNER" } });
            expect(mockTx.enterprise.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    name: "Test Company",
                    email: "company@test.com",
                    phoneNumber: "(11) 99999-9999"
                })
            });

            expect(mockTx.user.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    name: "Test User",
                    email: "user@test.com",
                    password: "hashed_pwd",
                    enterpriseId: "ent-123",
                    roleId: "role-123"
                })
            });

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
                message: "Dados já cadastrados no sistema."
            });
        });

        it("should throw 409 if company email already exists", async () => {
            (prisma.enterprise.findFirst as jest.Mock).mockResolvedValueOnce({ id: "ent-exist" }); // mocks existingCompanyEmail

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
                message: "E-mail da empresa já cadastrado."
            });
        });

        it("should throw 409 if company phone already exists", async () => {
            (prisma.enterprise.findFirst as jest.Mock)
                .mockResolvedValueOnce(null) // existingCompanyEmail
                .mockResolvedValueOnce({ id: "ent-exist" }); // existingCompanyPhone

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
                message: "Telefone da empresa já cadastrado."
            });
        });

        it("should throw 409 if user email already exists", async () => {
            (prisma.enterprise.findFirst as jest.Mock)
                .mockResolvedValueOnce(null) // existingCompanyEmail
                .mockResolvedValueOnce(null); // existingCompanyPhone

            (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce({ id: "usr-exist" }); // existingUserEmail

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
                message: "O e-mail informado para o usuário já está cadastrado."
            });
        });

        it("should rollback transaction if user creation fails", async () => {
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
            expect(mockTx.enterprise.create).toHaveBeenCalled();
            expect(mockTx.user.create).toHaveBeenCalled();
        });
    });
});

describe("Auth Module - Login", () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: jest.Mock;

    beforeEach(() => {
        mockReq = {
            body: {
                email: "user@test.com",
                password: "password123"
            }
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        mockNext = jest.fn();
        jest.clearAllMocks();
    });

    describe("Controller", () => {
        it("should return 200 and token on valid login", async () => {
            (prisma.user.findFirst as jest.Mock).mockResolvedValue({
                id: "user-1",
                name: "Owner User",
                email: "user@test.com",
                password: "hashed_password",
                enterpriseId: "ent-1",
                role: { role: UserRole.OWNER }
            });
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            (jwt.sign as jest.Mock).mockReturnValue("mocked-jwt-token");

            await login(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ token: "mocked-jwt-token" });
        });

        it("should return 400 when email format is invalid", async () => {
            mockReq.body.email = "invalid-email";

            await login(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe("Os dados informados são inválidos.");
        });

        it("should return 400 when password is missing", async () => {
            delete mockReq.body.password;

            await login(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe("Os dados informados são inválidos.");
        });
    });

    describe("Service (loginIn)", () => {
        it("should successfully login OWNER user and generate JWT token", async () => {
            (prisma.user.findFirst as jest.Mock).mockResolvedValue({
                id: "owner-id",
                name: "Owner Name",
                email: "owner@test.com",
                password: "hashed_password",
                enterpriseId: "enterprise-id",
                role: { role: UserRole.OWNER }
            });
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            (jwt.sign as jest.Mock).mockReturnValue("generated-owner-jwt-token");

            const result = await loginIn({ email: "owner@test.com", password: "password123" });

            expect(bcrypt.compare).toHaveBeenCalledWith("password123", "hashed_password");
            expect(jwt.sign).toHaveBeenCalledWith(
                {
                    sub: "owner-id",
                    accountType: "USER",
                    role: UserRole.OWNER
                },
                expect.any(String),
                { expiresIn: "7d", algorithm: "HS256" }
            );
            expect(result).toEqual({ token: "generated-owner-jwt-token" });
            expect(result).not.toHaveProperty("password");
        });

        it("should successfully login ADMIN user and generate JWT token", async () => {
            (prisma.user.findFirst as jest.Mock).mockResolvedValue({
                id: "admin-id",
                name: "Admin Name",
                email: "admin@test.com",
                password: "hashed_password",
                enterpriseId: "enterprise-id",
                role: { role: UserRole.ADMIN }
            });
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            (jwt.sign as jest.Mock).mockReturnValue("generated-admin-jwt-token");

            const result = await loginIn({ email: "admin@test.com", password: "password123" });

            expect(jwt.sign).toHaveBeenCalledWith(
                {
                    sub: "admin-id",
                    accountType: "USER",
                    role: UserRole.ADMIN
                },
                expect.any(String),
                { expiresIn: "7d", algorithm: "HS256" }
            );
            expect(result).toEqual({ token: "generated-admin-jwt-token" });
            expect(result).not.toHaveProperty("password");
        });

        it("should throw 401 Credenciais inválidas when user is not found", async () => {
            (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(loginIn({ email: "nonexistent@test.com", password: "password123" }))
                .rejects.toMatchObject({
                    statusCode: 401,
                    message: "E-mail ou senha inválidos."
                });
        });

        it("should throw 401 Credenciais inválidas when password does not match", async () => {
            (prisma.user.findFirst as jest.Mock).mockResolvedValue({
                id: "user-id",
                name: "User",
                email: "user@test.com",
                password: "hashed_password",
                enterpriseId: "enterprise-id",
                role: { role: UserRole.OWNER }
            });
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(loginIn({ email: "user@test.com", password: "wrongpassword" }))
                .rejects.toMatchObject({
                    statusCode: 401,
                    message: "E-mail ou senha inválidos."
                });
        });
    });
});
