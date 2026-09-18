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
exports.remove = exports.update = exports.getById = exports.list = exports.create = exports.getPublicBySlug = void 0;
const appError_1 = require("../../shared/errors/appError");
const influencer_zod_1 = require("../../shared/zod/influencer.zod");
const influencerService = __importStar(require("./influencer.service"));
const domain_1 = require("../../shared/utils/domain");
const getPublicBySlug = async (req, res, next) => {
    try {
        console.log("[DEBUG API] Request recebido em getPublicBySlug", {
            hostname: req.hostname,
            host: req.headers.host,
            origin: req.headers.origin,
            forwardedHost: req.headers["x-forwarded-host"],
            url: req.originalUrl
        });
        const domain = (0, domain_1.extractDomain)(req);
        if (!domain) {
            return next(new appError_1.AppError("Domínio não identificado na requisição.", 403));
        }
        const slug = req.params.slug;
        if (!slug || slug.trim() === "") {
            return next(new appError_1.AppError("Slug não informado.", 400));
        }
        const result = await influencerService.getPublicInfluencerBySlug(slug, domain);
        return res.status(200).json({ data: result });
    }
    catch (error) {
        next(error);
    }
};
exports.getPublicBySlug = getPublicBySlug;
const create = async (req, res, next) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            return next(new appError_1.AppError("Não autorizado", 401));
        }
        const parsedData = influencer_zod_1.createInfluencerZod.parse(req.body);
        const enterpriseId = req.user.enterpriseId;
        const baseUrl = (0, domain_1.extractBaseUrl)(req);
        if (!baseUrl) {
            return next(new appError_1.AppError("Não foi possível extrair a URL base da requisição.", 400));
        }
        const result = await influencerService.createInfluencer(enterpriseId, parsedData, baseUrl);
        return res.status(201).json({ data: result });
    }
    catch (error) {
        if (error.name === "ZodError") {
            const message = error.issues?.[0]?.message || "Os dados informados são inválidos.";
            return next(new appError_1.AppError(message, 400));
        }
        next(error);
    }
};
exports.create = create;
const list = async (req, res, next) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            return next(new appError_1.AppError("Não autorizado", 401));
        }
        const enterpriseId = req.user.enterpriseId;
        const result = await influencerService.getInfluencers(enterpriseId);
        return res.status(200).json({ data: result });
    }
    catch (error) {
        next(error);
    }
};
exports.list = list;
const getById = async (req, res, next) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            return next(new appError_1.AppError("Não autorizado", 401));
        }
        const id = req.params.id;
        if (!id) {
            return next(new appError_1.AppError("ID do influenciador não informado.", 400));
        }
        const enterpriseId = req.user.enterpriseId;
        const result = await influencerService.getInfluencerById(id, enterpriseId);
        return res.status(200).json({ data: result });
    }
    catch (error) {
        next(error);
    }
};
exports.getById = getById;
const update = async (req, res, next) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            return next(new appError_1.AppError("Não autorizado", 401));
        }
        const id = req.params.id;
        if (!id) {
            return next(new appError_1.AppError("ID do influenciador não informado.", 400));
        }
        const parsedData = influencer_zod_1.updateInfluencerZod.parse(req.body);
        const enterpriseId = req.user.enterpriseId;
        const baseUrl = (0, domain_1.extractBaseUrl)(req);
        if (!baseUrl) {
            return next(new appError_1.AppError("Não foi possível extrair a URL base da requisição.", 400));
        }
        const result = await influencerService.updateInfluencer(id, enterpriseId, parsedData, baseUrl);
        return res.status(200).json({ data: result });
    }
    catch (error) {
        if (error.name === "ZodError") {
            const message = error.issues?.[0]?.message || "Os dados informados são inválidos.";
            return next(new appError_1.AppError(message, 400));
        }
        next(error);
    }
};
exports.update = update;
const remove = async (req, res, next) => {
    try {
        if (!req.user || !req.user.enterpriseId) {
            return next(new appError_1.AppError("Não autorizado", 401));
        }
        const id = req.params.id;
        if (!id) {
            return next(new appError_1.AppError("ID do influenciador não informado.", 400));
        }
        const enterpriseId = req.user.enterpriseId;
        await influencerService.deleteInfluencer(id, enterpriseId);
        return res.status(204).send();
    }
    catch (error) {
        next(error);
    }
};
exports.remove = remove;
