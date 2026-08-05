import type { NextFunction, Request, Response } from "express";
import { loginZod } from "../../shared/zod/auth.zod";

export const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsedData = loginZod.parse(req.body);
        const result = await loginIn(parsedData);

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}