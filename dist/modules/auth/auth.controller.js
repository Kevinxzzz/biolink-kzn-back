"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = void 0;
const auth_zod_1 = require("../../shared/zod/auth.zod");
const auth_service_1 = require("./auth.service");
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
