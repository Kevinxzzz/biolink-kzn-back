"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCategoryZod = exports.createCategoryZod = void 0;
const zod_1 = require("zod");
exports.createCategoryZod = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, "O nome é obrigatório").max(100, "O nome deve ter no máximo 100 caracteres")
}).strict();
exports.updateCategoryZod = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, "O nome não pode ser vazio").max(100, "O nome deve ter no máximo 100 caracteres")
}).strict();
