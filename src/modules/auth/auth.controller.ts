import type { NextFunction, Request, Response } from "express";
import { loginZod, registerEnterprisePayloadZod } from "../../shared/zod/auth.zod";
import { loginIn, registerEnterprise, getAuthenticatedUser } from "./auth.service";
import { AppError } from "../../shared/errors/appError";
import { extractDomain } from "../../shared/utils/domain";
import { setAuthCookie, clearAuthCookie } from "../../shared/utils/cookie";

export const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsedData = loginZod.parse(req.body);
        const domain = extractDomain(req);
        const result = await loginIn(parsedData, domain);

        // Injeta o token como cookie HttpOnly para ser enviado automaticamente
        // nas navegações diretas (ex: redirect de link), além do retorno normal no body.
        setAuthCookie(res, result.token);

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

        const domain = extractDomain(req);
        const result = await registerEnterprise(inputData, domain);

        return res.status(201).json(result);
    } catch (error: any) {
        if (error.name === "ZodError") {
            next(new AppError("Os dados informados são inválidos.", 400));
            return;
        }
        next(error);
    }
}

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            throw new AppError("Não autenticado.", 401);
        }

        const result = await getAuthenticatedUser(req.user);

        return res.status(200).json(result);
    } catch (error: any) {
        next(error);
    }
};

/**
 * Encerra a sessão do usuário removendo o cookie de autenticação.
 * O frontend também deve remover o token do localStorage.
 */
export const logout = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        clearAuthCookie(res);
        return res.status(200).json({ message: "Logout realizado com sucesso." });
    } catch (error: any) {
        next(error);
    }
};