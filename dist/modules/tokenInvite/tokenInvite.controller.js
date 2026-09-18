"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = exports.validate = exports.remove = exports.list = exports.create = void 0;
const tokenInvite_zod_1 = require("../../shared/zod/tokenInvite.zod");
const tokenInviteService = __importStar(require("./tokenInvite.service"));
const appError_1 = require("../../shared/errors/appError");
const domain_1 = require("../../shared/utils/domain");
const create = async (req, res, next) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            throw new appError_1.AppError("Não autorizado", 401);
        }
        const parsedData = tokenInvite_zod_1.createTokenInviteZod.parse(req.body);
        const result = await tokenInviteService.createTokenInvite(parsedData, req.user.enterpriseId, req.user.id);
        return res.status(201).json({ message: "Convite criado com sucesso", data: result });
    }
    catch (error) {
        if (error.name === "ZodError") {
            next(new appError_1.AppError("Os dados informados são inválidos.", 400));
            return;
        }
        next(error);
    }
};
exports.create = create;
const list = async (req, res, next) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            throw new appError_1.AppError("Não autorizado", 401);
        }
        const result = await tokenInviteService.listTokenInvites(req.user.enterpriseId);
        // Monta o link para cada convite, usando o domínio da aplicação logada
        // A arquitetura assume req.user.applicationId vem do authenticate.ts, vamos buscar ou usar apenas o token
        // Porém o link publico será `https://${domain}/register/invite/${token}`.
        // O `authenticate.ts` tem access to req.user.applicationId mas não ao domain diretamente se não consultarmos.
        // O requestDomain pode vir do request da chamada do list, que já foi extraído pelo middleware de auth e batido no banco.
        const domain = (0, domain_1.extractDomain)(req);
        const dataWithLinks = result.map(t => ({
            ...t,
            link: domain ? `https://${domain}/register/invite/${t.token}` : null
        }));
        return res.status(200).json(dataWithLinks);
    }
    catch (error) {
        next(error);
    }
};
exports.list = list;
const remove = async (req, res, next) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            throw new appError_1.AppError("Não autorizado", 401);
        }
        const id = req.params.id;
        const result = await tokenInviteService.deleteTokenInvite(id, req.user.enterpriseId);
        return res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
};
exports.remove = remove;
const validate = async (req, res, next) => {
    try {
        const token = req.params.token;
        const domain = (0, domain_1.extractDomain)(req);
        if (!domain) {
            throw new appError_1.AppError("Domínio não identificado.", 400);
        }
        const result = await tokenInviteService.validateToken(token, domain);
        return res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
};
exports.validate = validate;
const register = async (req, res, next) => {
    try {
        const token = req.params.token;
        const domain = (0, domain_1.extractDomain)(req);
        if (!domain) {
            throw new appError_1.AppError("Domínio não identificado.", 400);
        }
        const parsedData = tokenInvite_zod_1.registerViaTokenZod.parse(req.body);
        const result = await tokenInviteService.registerViaToken(token, domain, parsedData);
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
exports.register = register;
