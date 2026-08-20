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
exports.reorder = exports.activate = exports.remove = exports.update = exports.getById = exports.list = exports.create = void 0;
const appError_1 = require("../../shared/errors/appError");
const links_zod_1 = require("../../shared/zod/links.zod");
const linksService = __importStar(require("./links.service"));
const create = async (req, res, next) => {
    try {
        const parsedData = links_zod_1.createLinkZod.parse(req.body);
        const enterpriseId = req.user.enterpriseId;
        const result = await linksService.createLink(enterpriseId, parsedData);
        return res.status(201).json({ data: result });
    }
    catch (error) {
        if (error.name === "ZodError") {
            return next(new appError_1.AppError("Os dados informados são inválidos.", 400));
        }
        next(error);
    }
};
exports.create = create;
const list = async (req, res, next) => {
    try {
        const enterpriseId = req.user.enterpriseId;
        const categoryId = req.query.categoryId;
        const result = await linksService.getLinks(enterpriseId, categoryId);
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
        const result = await linksService.getLinkById(id, enterpriseId);
        return res.status(200).json({ data: result });
    }
    catch (error) {
        next(error);
    }
};
exports.getById = getById;
const update = async (req, res, next) => {
    try {
        const parsedData = links_zod_1.updateLinkZod.parse(req.body);
        const enterpriseId = req.user.enterpriseId;
        const id = req.params.id;
        const result = await linksService.updateLink(id, enterpriseId, parsedData);
        return res.status(200).json({ data: result });
    }
    catch (error) {
        if (error.name === "ZodError") {
            return next(new appError_1.AppError("Os dados informados são inválidos.", 400));
        }
        next(error);
    }
};
exports.update = update;
const remove = async (req, res, next) => {
    try {
        const enterpriseId = req.user.enterpriseId;
        const id = req.params.id;
        await linksService.deleteLink(id, enterpriseId);
        return res.status(204).send();
    }
    catch (error) {
        next(error);
    }
};
exports.remove = remove;
const activate = async (req, res, next) => {
    try {
        const enterpriseId = req.user.enterpriseId;
        const id = req.params.id;
        const result = await linksService.activateLink(id, enterpriseId);
        return res.status(200).json({ data: result });
    }
    catch (error) {
        next(error);
    }
};
exports.activate = activate;
const reorder = async (req, res, next) => {
    try {
        const parsedData = links_zod_1.reorderLinksZod.parse(req.body);
        const enterpriseId = req.user.enterpriseId;
        const result = await linksService.reorderLinks(enterpriseId, parsedData);
        return res.status(200).json({ data: result });
    }
    catch (error) {
        if (error.name === "ZodError") {
            return next(new appError_1.AppError("Os dados informados são inválidos.", 400));
        }
        next(error);
    }
};
exports.reorder = reorder;
