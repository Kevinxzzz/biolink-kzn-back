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
        const domain = (0, domain_1.extractDomain)(req);
        if (!domain) {
            return next(new appError_1.AppError("Domínio não identificado na requisição.", 403));
        }
        const slug = req.params.slug;
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
        const parsedData = influencer_zod_1.createInfluencerZod.parse(req.body);
        const enterpriseId = req.user.enterpriseId;
        const result = await influencerService.createInfluencer(enterpriseId, parsedData);
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
        const enterpriseId = req.user.enterpriseId;
        const id = req.params.id;
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
        const parsedData = influencer_zod_1.updateInfluencerZod.parse(req.body);
        const enterpriseId = req.user.enterpriseId;
        const id = req.params.id;
        const result = await influencerService.updateInfluencer(id, enterpriseId, parsedData);
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
        const enterpriseId = req.user.enterpriseId;
        const id = req.params.id;
        await influencerService.deleteInfluencer(id, enterpriseId);
        return res.status(204).send();
    }
    catch (error) {
        next(error);
    }
};
exports.remove = remove;
