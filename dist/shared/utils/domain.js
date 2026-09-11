"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDomain = extractDomain;
exports.normalizeDomain = normalizeDomain;
/**
 * Extrai o domínio de uma requisição HTTP de forma segura usando req.hostname.
 * O Express cuida do X-Forwarded-Host automaticamente se 'trust proxy' estiver configurado.
 *
 * @param req Objeto de requisição do Express
 * @returns Domínio normalizado (sem protocolo, porta ou trailing slashes) ou null
 */
function extractDomain(req) {
    const origin = req.headers.origin;
    if (origin) {
        try {
            return normalizeDomain(new URL(origin).hostname);
        }
        catch {
            // Ignora a URL malformada e segue para o fallback
        }
    }
    if (req.hostname) {
        return normalizeDomain(req.hostname);
    }
    return null;
}
/**
 * Normaliza uma URL ou Host para extrair apenas o domínio puro.
 *
 * @param url String contendo a URL, Origin ou Hostname
 * @returns String normalizada (ex: "kzn.com", "localhost")
 */
function normalizeDomain(url) {
    if (!url)
        return '';
    // Remove protocolo (http://, https://)
    let clean = url.replace(/^https?:\/\//i, '');
    // Remove qualquer path ou trailing slash
    clean = clean.split('/')[0];
    // Remove a porta, garantindo 'localhost' em vez de 'localhost:3000'
    clean = clean.split(':')[0];
    // Converte para minúsculas e remove espaços
    return clean.toLowerCase().trim();
}
