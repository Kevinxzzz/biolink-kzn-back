"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../shared/database/prisma");
const tokenInviteService = __importStar(require("./tokenInvite.service"));
const authService = __importStar(require("../auth/auth.service"));
jest.mock("../../shared/database/prisma", () => ({
    prisma: {
        enterpriseTokenInvite: {
            create: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            delete: jest.fn()
        },
        application: {
            findUnique: jest.fn()
        },
        $transaction: jest.fn()
    }
}));
jest.mock("../auth/auth.service", () => ({
    createUserValidationAndHash: jest.fn()
}));
jest.mock("crypto", () => ({
    randomBytes: jest.fn(() => ({
        toString: jest.fn(() => "mocked-token-123")
    }))
}));
describe("TokenInvite Service", () => {
    let mockTx;
    beforeEach(() => {
        jest.clearAllMocks();
        mockTx = {
            $executeRaw: jest.fn(),
            userTokenInvite: {
                count: jest.fn(),
                create: jest.fn()
            },
            role: {
                findFirst: jest.fn()
            },
            user: {
                create: jest.fn()
            }
        };
        prisma_1.prisma.$transaction.mockImplementation(async (cb) => {
            return await cb(mockTx);
        });
    });
    describe("createTokenInvite", () => {
        it("should create a token invite with expiresAt derived from expiresInHours", async () => {
            prisma_1.prisma.enterpriseTokenInvite.create.mockResolvedValue({ id: "token-1", token: "mocked-token-123" });
            const result = await tokenInviteService.createTokenInvite({ expiresInHours: 24, maxUses: 5 }, "ent-1", "user-1");
            expect(prisma_1.prisma.enterpriseTokenInvite.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    token: "mocked-token-123",
                    maxUses: 5,
                    enterpriseId: "ent-1",
                    createdById: "user-1",
                    expiresAt: expect.any(Date)
                })
            });
            expect(result).toEqual({ id: "token-1", token: "mocked-token-123" });
        });
    });
    describe("listTokenInvites", () => {
        it("should list tokens and calculate their status properly", async () => {
            const futureDate = new Date();
            futureDate.setHours(futureDate.getHours() + 10);
            const pastDate = new Date();
            pastDate.setHours(pastDate.getHours() - 10);
            prisma_1.prisma.enterpriseTokenInvite.findMany.mockResolvedValue([
                { id: "1", token: "t1", maxUses: 5, expiresAt: futureDate, _count: { userTokenInvites: 2 } }, // ATIVO
                { id: "2", token: "t2", maxUses: 5, expiresAt: pastDate, _count: { userTokenInvites: 1 } }, // EXPIRADO
                { id: "3", token: "t3", maxUses: 2, expiresAt: futureDate, _count: { userTokenInvites: 2 } }, // ESGOTADO
            ]);
            const result = await tokenInviteService.listTokenInvites("ent-1");
            expect(result).toHaveLength(3);
            expect(result[0].status).toBe("ATIVO");
            expect(result[0].uses).toBe(2);
            expect(result[1].status).toBe("EXPIRADO");
            expect(result[2].status).toBe("ESGOTADO");
        });
    });
    describe("deleteTokenInvite", () => {
        it("should delete the token if the OWNER belongs to the same enterprise", async () => {
            prisma_1.prisma.enterpriseTokenInvite.findUnique.mockResolvedValue({ id: "1", enterpriseId: "ent-1" });
            await tokenInviteService.deleteTokenInvite("1", "ent-1");
            expect(prisma_1.prisma.enterpriseTokenInvite.delete).toHaveBeenCalledWith({ where: { id: "1" } });
        });
        it("should throw 404 if the token belongs to another enterprise", async () => {
            prisma_1.prisma.enterpriseTokenInvite.findUnique.mockResolvedValue({ id: "1", enterpriseId: "ent-2" });
            await expect(tokenInviteService.deleteTokenInvite("1", "ent-1")).rejects.toMatchObject({
                statusCode: 404,
                message: "Convite não encontrado."
            });
            expect(prisma_1.prisma.enterpriseTokenInvite.delete).not.toHaveBeenCalled();
        });
    });
    describe("registerViaToken", () => {
        it("should register a user atomically", async () => {
            const futureDate = new Date();
            futureDate.setHours(futureDate.getHours() + 10);
            prisma_1.prisma.application.findUnique.mockResolvedValue({
                id: "app-1",
                enterprise: { id: "ent-1" }
            });
            prisma_1.prisma.enterpriseTokenInvite.findFirst.mockResolvedValue({
                id: "token-1",
                token: "valid-token",
                enterpriseId: "ent-1",
                maxUses: 10,
                expiresAt: futureDate
            });
            authService.createUserValidationAndHash.mockResolvedValue("hashedPwd");
            mockTx.userTokenInvite.count.mockResolvedValue(5);
            mockTx.role.findFirst.mockResolvedValue({ id: "role-admin", role: "ADMIN" });
            mockTx.user.create.mockResolvedValue({ id: "new-user-1" });
            const result = await tokenInviteService.registerViaToken("valid-token", "localhost", {
                name: "Test",
                email: "test@test.com",
                password: "123",
                confirmPassword: "123"
            });
            expect(mockTx.$executeRaw).toHaveBeenCalled();
            expect(mockTx.user.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    name: "Test",
                    email: "test@test.com",
                    roleId: "role-admin",
                    enterpriseId: "ent-1"
                })
            });
            expect(mockTx.userTokenInvite.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    usedBy: "new-user-1",
                    tokenInviteId: "token-1"
                })
            });
            expect(result.message).toBe("Usuário cadastrado com sucesso");
        });
        it("should throw 403 if max uses reached concurrently", async () => {
            const futureDate = new Date();
            futureDate.setHours(futureDate.getHours() + 10);
            prisma_1.prisma.application.findUnique.mockResolvedValue({
                id: "app-1",
                enterprise: { id: "ent-1" }
            });
            prisma_1.prisma.enterpriseTokenInvite.findFirst.mockResolvedValue({
                id: "token-1",
                token: "valid-token",
                enterpriseId: "ent-1",
                maxUses: 1, // limit is 1
                expiresAt: futureDate
            });
            authService.createUserValidationAndHash.mockResolvedValue("hashedPwd");
            // Simulate that another request already took the slot
            mockTx.userTokenInvite.count.mockResolvedValue(1);
            await expect(tokenInviteService.registerViaToken("valid-token", "localhost", {
                name: "Test",
                email: "test@test.com",
                password: "123",
                confirmPassword: "123"
            })).rejects.toMatchObject({
                statusCode: 403,
                message: "Este convite atingiu o limite máximo de usos."
            });
            expect(mockTx.user.create).not.toHaveBeenCalled();
            expect(mockTx.userTokenInvite.create).not.toHaveBeenCalled();
        });
    });
});
