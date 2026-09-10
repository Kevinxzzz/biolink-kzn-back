"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.registerCompany = exports.login = void 0;
const auth_zod_1 = require("../../shared/zod/auth.zod");
const auth_service_1 = require("./auth.service");
const appError_1 = require("../../shared/errors/appError");
const domain_1 = require("../../shared/utils/domain");
const login = async (req, res, next) => {
    try {
        const parsedData = auth_zod_1.loginZod.parse(req.body);
        const domain = (0, domain_1.extractDomain)(req);
        const result = await (0, auth_service_1.loginIn)(parsedData, domain);
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
