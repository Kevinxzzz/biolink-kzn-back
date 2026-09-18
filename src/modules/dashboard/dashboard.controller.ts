import { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/errors/appError";
import { getDashboardSchema } from "../../shared/zod/dashboard.zod";
import * as dashboardService from "./dashboard.service";

export const getDashboardController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enterpriseId = req.user!.enterpriseId;
        const parsedData = getDashboardSchema.parse({ query: req.query });

        const result = await dashboardService.getDashboardService(enterpriseId, {
            period: parsedData.query.period as "dia" | "mes" | "ano",
            linkId: parsedData.query.linkId,
            influencerId: parsedData.query.influencerId
        });

        res.status(200).json(result);
    } catch (error: any) {
        if (error.name === "ZodError") {
            const message = error.issues?.[0]?.message || "Os dados informados são inválidos.";
            return next(new AppError(message, 400));
        }
        next(error);
    }
};
