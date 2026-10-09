"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.getMe = exports.registerCompany = exports.login = void 0;
const auth_zod_1 = require("../../shared/zod/auth.zod");
const auth_service_1 = require("./auth.service");
const appError_1 = require("../../shared/errors/appError");
const domain_1 = require("../../shared/utils/domain");
const cookie_1 = require("../../shared/utils/cookie");
const login = async (req, res, next) => {
    try {
        const parsedData = auth_zod_1.loginZod.parse(req.body);
        const domain = (0, domain_1.extractDomain)(req);
        const result = await (0, auth_service_1.loginIn)(parsedData, domain);
        // Injeta o token como cookie HttpOnly para ser enviado automaticamente
        // nas navegações diretas (ex: redirect de link), além do retorno normal no body.
        (0, cookie_1.setAuthCookie)(res, result.token);
        return res.status(200).json(result);
    }
    catch (error) {
        if (error.name === "ZodError") {
            next(new appError_1.AppError("Os dados informados são inválidos.", 400));
            return;
        }
        next(error);
    }
};
exports.login = login;
const registerCompany = async (req, res, next) => {
    try {
        const parsedData = auth_zod_1.registerEnterprisePayloadZod.parse(req.body);
        // Remove confirmPassword from the service payload
        const { confirmPassword, ...userWithoutConfirmPassword } = parsedData.user;
        const inputData = {
            company: parsedData.company,
            user: userWithoutConfirmPassword,
        };
        const domain = (0, domain_1.extractDomain)(req);
        const result = await (0, auth_service_1.registerEnterprise)(inputData, domain);
        return res.status(201).json(result);
    }
    catch (error) {
        if (error.name === "ZodError") {
            next(new appError_1.AppError("Os dados informados são inválidos.", 400));
            return;
        }
        next(error);
    }
};
exports.registerCompany = registerCompany;
const getMe = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new appError_1.AppError("Não autenticado.", 401);
        }
        const result = await (0, auth_service_1.getAuthenticatedUser)(req.user);
        return res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
};
exports.getMe = getMe;
/**
 * Encerra a sessão do usuário removendo o cookie de autenticação.
 * O frontend também deve remover o token do localStorage.
 */
const logout = async (_req, res, next) => {
    try {
        (0, cookie_1.clearAuthCookie)(res);
        return res.status(200).json({ message: "Logout realizado com sucesso." });
    }
    catch (error) {
        next(error);
    }
};
exports.logout = logout;
