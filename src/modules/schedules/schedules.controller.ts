import { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/errors/appError";
import { createScheduleZod, updateScheduleZod } from "../../shared/zod/schedules.zod";
import * as schedulesService from "./schedules.service";

export const create = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsedData = createScheduleZod.parse(req.body);
        const enterpriseId = req.user!.enterpriseId;

        const result = await schedulesService.createSchedule(enterpriseId, parsedData);

        return res.status(201).json({ data: result });
    } catch (error: any) {
        if (error.name === "ZodError") {
            const message = error.issues?.[0]?.message || "Os dados informados são inválidos.";
            return next(new AppError(message, 400));
        }
        next(error);
    }
};

export const list = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enterpriseId = req.user!.enterpriseId;
        const result = await schedulesService.getSchedules(enterpriseId);

        return res.status(200).json({ data: result });
    } catch (error) {
        next(error);
    }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enterpriseId = req.user!.enterpriseId;
        const id = req.params.id as string;

        const result = await schedulesService.getScheduleById(id, enterpriseId);

        return res.status(200).json({ data: result });
    } catch (error) {
        next(error);
    }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsedData = updateScheduleZod.parse(req.body);
        const enterpriseId = req.user!.enterpriseId;
        const id = req.params.id as string;

        const result = await schedulesService.updateSchedule(id, enterpriseId, parsedData);

        return res.status(200).json({ data: result });
    } catch (error: any) {
        if (error.name === "ZodError") {
            const message = error.issues?.[0]?.message || "Os dados informados são inválidos.";
            return next(new AppError(message, 400));
        }
        next(error);
    }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enterpriseId = req.user!.enterpriseId;
        const id = req.params.id as string;

        await schedulesService.deleteSchedule(id, enterpriseId);

        return res.status(204).send();
    } catch (error) {
        next(error);
    }
};
