"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateScheduleZod = exports.createScheduleZod = void 0;
const zod_1 = require("zod");
exports.createScheduleZod = zod_1.z.object({
    enterpriseUrlId: zod_1.z.string().uuid("O ID do link deve ser um UUID válido"),
    dateTime: zod_1.z.coerce.date().refine((date) => date > new Date(), {
        message: "A data e hora do agendamento deve ser no futuro",
    }),
}).strict();
exports.updateScheduleZod = zod_1.z.object({
    enterpriseUrlId: zod_1.z.string().uuid("O ID do link deve ser um UUID válido").optional(),
    dateTime: zod_1.z.coerce.date().optional(),
    active: zod_1.z.boolean().optional(),
}).strict();
