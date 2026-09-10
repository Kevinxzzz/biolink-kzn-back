import type { UserRole } from "@prisma/client";

export interface TokenPayload {
    sub: string;
    accountType: "USER" | "INFLUENCER";
    role?: UserRole;
    applicationId?: string;
}

export interface AuthenticatedUser {
    id: string;
    email: string;
    enterpriseId: string;
    applicationId?: string;
    accountType: "USER" | "INFLUENCER";
    role?: UserRole;
}
