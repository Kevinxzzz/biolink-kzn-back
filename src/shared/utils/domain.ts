import { Request } from 'express';

/**
 * Extrai o domínio de uma requisição HTTP de forma segura usando req.hostname.
 * O Express cuida do X-Forwarded-Host automaticamente se 'trust proxy' estiver configurado.
 * 
 * @param req Objeto de requisição do Express
 * @returns Domínio normalizado (sem protocolo, porta ou trailing slashes) ou null
 */
export function extractDomain(req: Request): string | null {
    if (!req.hostname) return null;
    console.log({
        hostname: req.hostname,
        host: req.headers.host,
        forwardedHost: req.headers["x-forwarded-host"],
        origin: req.headers.origin,
    });
    return normalizeDomain(req.hostname);
}

/**
 * Normaliza uma URL ou Host para extrair apenas o domínio puro.
 * 
 * @param url String contendo a URL, Origin ou Hostname
 * @returns String normalizada (ex: "kzn.com", "localhost")
 */
export function normalizeDomain(url: string): string {
    if (!url) return '';

    // Remove protocolo (http://, https://)
    let clean = url.replace(/^https?:\/\//i, '');

    // Remove qualquer path ou trailing slash
    clean = clean.split('/')[0];

    // Remove a porta, garantindo 'localhost' em vez de 'localhost:3000'
    clean = clean.split(':')[0];

    // Converte para minúsculas e remove espaços
    return clean.toLowerCase().trim();
}
