import type { NextFunction, Request, Response } from "express";
import { loginZod, registerEnterprisePayloadZod } from "../../shared/zod/auth.zod";
import { loginIn, registerEnterprise } from "./auth.service";
import { AppError } from "../../shared/errors/appError";

export const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsedData = loginZod.parse(req.body);
        const result = await loginIn(parsedData);

        return res.status(200).json(result);
    } catch (error: any) {
        if (error.name === "ZodError") {
            next(new AppError("Os dados informados são inválidos.", 400));
            return;
        }
        next(error);
    }
}

export const registerCompany = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsedData = registerEnterprisePayloadZod.parse(req.body);
        
        // Remove confirmPassword from the service payload
        const { confirmPassword, ...userWithoutConfirmPassword } = parsedData.user;
        const inputData = {
            company: parsedData.company,
            user: userWithoutConfirmPassword,
        };

        const result = await registerEnterprise(inputData);

        return res.status(201).json(result);
    } catch (error: any) {
        if (error.name === "ZodError") {
            next(new AppError("Os dados informados são inválidos.", 400));
            return;
        }
        next(error);
    }
}