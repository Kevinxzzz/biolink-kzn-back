import { z } from "zod";

export const loginZod = z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "A senha deve ter ao menos 6 caracteres")
})

export const registerEnterprisePayloadZod = z.object({
    company: z.object({
        name: z.string().min(3, "Nome da empresa obrigatório"),
        email: z.string().email("Email inválido"),
        phone: z.string().regex(/^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/, "Telefone inválido")
    }),
    user: z.object({
        name: z.string().min(3, "Nome de usuário obrigatório"),
        email: z.string().email("Email inválido"),
        password: z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
        confirmPassword: z.string()
    })
}).refine((data) => data.user.password === data.user.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["user", "confirmPassword"]
});