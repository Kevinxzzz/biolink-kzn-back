"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCompany = exports.login = void 0;
const auth_zod_1 = require("../../shared/zod/auth.zod");
const auth_service_1 = require("./auth.service");
const appError_1 = require("../../shared/errors/appError");
const login = async (req, res, next) => {
    try {
        const parsedData = auth_zod_1.loginZod.parse(req.body);
        const result = await (0, auth_service_1.loginIn)(parsedData);
        return res.status(200).json(result);
    }
    catch (error) {
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
        const result = await (0, auth_service_1.registerEnterprise)(inputData);
        return res.status(201).json(result);
    }
    catch (error) {
        if (error.name === "ZodError") {
            next(new appError_1.AppError("Dados inválidos", 400));
            return;
        }
        next(error);
    }
};
exports.registerCompany = registerCompany;
