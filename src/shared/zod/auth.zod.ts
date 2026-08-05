import { z } from "zod";

export const loginZod = z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "A senha deve ter ao menos 6 caracteres")
})

export const registerEnterpriseZod = z.object({
    name: z.string().min(3, "O nome deve ter no mínimmo 3 caracteres"),
    email: z.string().email("Email inválido"),
    phoneNumber: z.string().regex(
        /^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/,
        "Telefone inválido"
    ),
})