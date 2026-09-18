import { z } from "zod";

export const createTokenInviteZod = z.object({
    maxUses: z.number().int().positive().optional(),
    expiresInHours: z.number().int().positive()
});

export const registerViaTokenZod = z.object({
    name: z.string().min(3, "O nome deve ter no mínimo 3 caracteres"),
    email: z.string().email("O e-mail informado é inválido"),
    password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
    confirmPassword: z.string().min(6, "A confirmação deve ter no mínimo 6 caracteres")
}).refine(data => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
});

export type CreateTokenInviteInput = z.infer<typeof createTokenInviteZod>;
export type RegisterViaTokenInput = z.infer<typeof registerViaTokenZod>;
