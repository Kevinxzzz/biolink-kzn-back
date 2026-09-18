import { z } from "zod";

export const getDashboardSchema = z.object({
    query: z.object({
        period: z.enum(["dia", "mes", "ano"]).optional().default("dia"),
        linkId: z.string().uuid("Formato de linkId inválido").optional(),
        influencerId: z.string().uuid("Formato de influencerId inválido").optional(),
    }).refine(data => !(data.linkId && data.influencerId), {
        message: "Filtros simultâneos de Link e Influenciador não são suportados",
        path: ["linkId", "influencerId"]
    })
});
