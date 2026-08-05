import type { UserRole } from "@prisma/client";

export interface TokenPayload {
    sub: string;
    accountType: "USER" | "INFLUENCER";
    role?: UserRole;
}

export interface AuthenticatedUser {
    id: string;
    email: string;
    enterpriseId: string;
    accountType: "USER" | "INFLUENCER";
    role?: UserRole;
}
