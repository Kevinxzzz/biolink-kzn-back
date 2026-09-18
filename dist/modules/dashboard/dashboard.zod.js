"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardSchema = void 0;
const zod_1 = require("zod");
exports.getDashboardSchema = zod_1.z.object({
    query: zod_1.z.object({
        period: zod_1.z.enum(["dia", "mes", "ano"]).optional().default("dia"),
        linkId: zod_1.z.string().uuid("Formato de linkId inválido").optional(),
        influencerId: zod_1.z.string().uuid("Formato de influencerId inválido").optional(),
    }).refine(data => !(data.linkId && data.influencerId), {
        message: "Filtros simultâneos de Link e Influenciador não são suportados",
        path: ["linkId", "influencerId"]
    })
});
