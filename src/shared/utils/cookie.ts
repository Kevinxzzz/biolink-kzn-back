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

/**
 * Define o cookie de identificação de visitante na resposta.
 * O cookie é host-only da API: sem atributo Domain explícito.
 */
export function setVisitorCookie(res: Response, visitorId: string): void {
    const isSecure = isSecureEnvironment();

    res.cookie(VISITOR_COOKIE_NAME, visitorId, {
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
