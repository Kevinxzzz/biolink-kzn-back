import { z } from "zod";

export const createScheduleZod = z.object({
    enterpriseUrlId: z.string().uuid("O ID do link deve ser um UUID válido"),
    dateTime: z.coerce.date().refine((date) => date > new Date(), {
        message: "A data e hora do agendamento deve ser no futuro",
    }),
}).strict();

export const updateScheduleZod = z.object({
    enterpriseUrlId: z.string().uuid("O ID do link deve ser um UUID válido").optional(),
    dateTime: z.coerce.date().optional(),
    active: z.boolean().optional(),
}).strict();

export type CreateScheduleInput = z.infer<typeof createScheduleZod>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleZod>;
