import { Request, Response } from "express";
import { env } from "../config/env";

const AUTH_COOKIE_NAME = "kzn_auth_token";
const VISITOR_COOKIE_NAME = "kzn_visitor_id";

/**
 * Faz o parse manual da string do header Cookie, retornando um mapa de nome → valor.
 * Não utiliza nenhuma dependência externa.
 */
function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};

    for (const pair of cookieHeader.split(";")) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex < 0) continue;

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
export function readCookie(req: Request, name: string): string | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = parseCookies(cookieHeader);
    return cookies[name] ?? null;
}

/**
 * Lê o cookie de autenticação da requisição.
 */
export function readAuthCookie(req: Request): string | null {
    return readCookie(req, AUTH_COOKIE_NAME);
}

/**
 * Lê o cookie de identificação de visitante da requisição.
 */
export function readVisitorCookie(req: Request): string | null {
    return readCookie(req, VISITOR_COOKIE_NAME);
}

/**
 * Determina se o ambiente atual usa HTTPS (produção).
 * Garante que o atributo Secure seja definido apenas em produção.
 */
function isSecureEnvironment(): boolean {
    return env.NODE_ENV === "production";
}

/**
 * Define o cookie de autenticação do usuário na resposta.
 * O cookie é host-only da API: sem atributo Domain explícito.
 * Em produção, usa SameSite=None + Secure para suportar cross-origin (frontend → API).
 * Em desenvolvimento, usa SameSite=Lax + sem Secure.
 */
export function setAuthCookie(res: Response, token: string): void {
    const isSecure = isSecureEnvironment();

    res.cookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? "none" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias em ms (alinhado com expiração do JWT)
    });
}

export interface VisitorCookiePayload {
    id: string;
    categories: Record<string, number>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseVisitorPayload(rawCookie: string | null): VisitorCookiePayload | null {
    if (!rawCookie) return null;

    try {
        const decoded = Buffer.from(rawCookie, "base64").toString("utf8");
        const parsed = JSON.parse(decoded);

        if (parsed && typeof parsed.id === "string" && parsed.categories !== null && typeof parsed.categories === "object" && !Array.isArray(parsed.categories)) {
            const now = Date.now();
            const cleanCategories: Record<string, number> = {};
            
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
    } catch {
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

export function serializeVisitorPayload(payload: VisitorCookiePayload): string {
    return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Define o cookie de identificação de visitante na resposta.
 * O cookie armazena o payload serializado em Base64.
 */
export function setVisitorCookie(res: Response, payload: VisitorCookiePayload): void {
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
export function clearAuthCookie(res: Response): void {
    const isSecure = isSecureEnvironment();

    res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? "none" : "lax",
        path: "/",
    });
}

export { AUTH_COOKIE_NAME, VISITOR_COOKIE_NAME };
