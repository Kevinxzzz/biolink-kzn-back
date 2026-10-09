"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VISITOR_COOKIE_NAME = exports.AUTH_COOKIE_NAME = void 0;
exports.readCookie = readCookie;
exports.readAuthCookie = readAuthCookie;
exports.readVisitorCookie = readVisitorCookie;
exports.setAuthCookie = setAuthCookie;
exports.parseVisitorPayload = parseVisitorPayload;
exports.serializeVisitorPayload = serializeVisitorPayload;
exports.setVisitorCookie = setVisitorCookie;
exports.clearAuthCookie = clearAuthCookie;
const env_1 = require("../config/env");
const AUTH_COOKIE_NAME = "kzn_auth_token";
exports.AUTH_COOKIE_NAME = AUTH_COOKIE_NAME;
const VISITOR_COOKIE_NAME = "kzn_visitor_id";
exports.VISITOR_COOKIE_NAME = VISITOR_COOKIE_NAME;
/**
 * Faz o parse manual da string do header Cookie, retornando um mapa de nome → valor.
 * Não utiliza nenhuma dependência externa.
 */
function parseCookies(cookieHeader) {
    const cookies = {};
    for (const pair of cookieHeader.split(";")) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex < 0)
            continue;
        const name = pair.slice(0, eqIndex).trim();
        const value = pair.slice(eqIndex + 1).trim();
        if (name) {
            cookies[name] = decodeURIComponent(value);
        }
    }
    return cookies;
}
/**
 * Lê um cookie específico da requisição.
 * Retorna null se o header Cookie não existir ou o cookie não for encontrado.
 */
function readCookie(req, name) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader)
        return null;
    const cookies = parseCookies(cookieHeader);
    return cookies[name] ?? null;
}
/**
 * Lê o cookie de autenticação da requisição.
 */
function readAuthCookie(req) {
    return readCookie(req, AUTH_COOKIE_NAME);
}
/**
 * Lê o cookie de identificação de visitante da requisição.
 */
function readVisitorCookie(req) {
    return readCookie(req, VISITOR_COOKIE_NAME);
}
/**
 * Determina se o ambiente atual usa HTTPS (produção).
 * Garante que o atributo Secure seja definido apenas em produção.
 */
function isSecureEnvironment() {
    return env_1.env.NODE_ENV === "production";
}
/**
 * Define o cookie de autenticação do usuário na resposta.
 * O cookie é host-only da API: sem atributo Domain explícito.
 * Em produção, usa SameSite=None + Secure para suportar cross-origin (frontend → API).
 * Em desenvolvimento, usa SameSite=Lax + sem Secure.
 */
function setAuthCookie(res, token) {
    const isSecure = isSecureEnvironment();
    res.cookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? "none" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias em ms (alinhado com expiração do JWT)
    });
}
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parseVisitorPayload(rawCookie) {
    if (!rawCookie)
        return null;
    try {
        const decoded = Buffer.from(rawCookie, "base64").toString("utf8");
        const parsed = JSON.parse(decoded);
        if (parsed && typeof parsed.id === "string" && parsed.categories !== null && typeof parsed.categories === "object" && !Array.isArray(parsed.categories)) {
            const now = Date.now();
            const cleanCategories = {};
            for (const [key, value] of Object.entries(parsed.categories)) {
                if (typeof value === "number" && isFinite(value) && value >= 0 && value <= now) {
                    cleanCategories[key] = value;
                }
            }
            return {
                id: parsed.id,
                categories: cleanCategories
            };
        }
    }
    catch {
        // Se falhar o parse JSON/Base64, verificar se é o UUID legado.
        if (UUID_REGEX.test(rawCookie)) {
            return {
                id: rawCookie,
                categories: {}
            };
        }
    }
    return null;
}
function serializeVisitorPayload(payload) {
    return Buffer.from(JSON.stringify(payload)).toString("base64");
}
/**
 * Define o cookie de identificação de visitante na resposta.
 * O cookie armazena o payload serializado em Base64.
 */
function setVisitorCookie(res, payload) {
    const isSecure = isSecureEnvironment();
    const serialized = serializeVisitorPayload(payload);
    res.cookie(VISITOR_COOKIE_NAME, serialized, {
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? "none" : "lax",
        path: "/",
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 ano em ms
    });
}
/**
 * Remove o cookie de autenticação na resposta (logout).
 * Os atributos devem ser idênticos aos usados em setAuthCookie para garantir a remoção.
 */
function clearAuthCookie(res) {
    const isSecure = isSecureEnvironment();
    res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? "none" : "lax",
        path: "/",
    });
}
