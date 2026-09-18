import { extractDomain, normalizeDomain, extractBaseUrl } from './domain';
import { Request } from 'express';

describe('Domain Utils', () => {
    describe('normalizeDomain', () => {
        it('deve remover http:// e https://', () => {
            expect(normalizeDomain('http://kzn.com')).toBe('kzn.com');
            expect(normalizeDomain('https://alecio.com')).toBe('alecio.com');
        });

        it('deve remover a porta', () => {
            expect(normalizeDomain('http://localhost:3000')).toBe('localhost');
            expect(normalizeDomain('localhost:3001')).toBe('localhost');
        });

        it('deve remover paths e barras invertidas', () => {
            expect(normalizeDomain('https://kzn.com/')).toBe('kzn.com');
            expect(normalizeDomain('https://kzn.com/api/v1')).toBe('kzn.com');
            expect(normalizeDomain('alecio.com/alguma/rota')).toBe('alecio.com');
        });

        it('deve retornar em lower case', () => {
            expect(normalizeDomain('HTTPS://KZN.COM')).toBe('kzn.com');
        });

        it('deve retornar string vazia para entrada falsy', () => {
            expect(normalizeDomain('')).toBe('');
        });
    });

    describe('extractDomain', () => {
        const mockRequest = (hostname?: string, headers: Record<string, string | string[] | undefined> = {}): Request => {
            return {
                hostname: hostname,
                headers: headers
            } as Request;
        };

        it('deve usar o Origin se fornecido', () => {
            const req = mockRequest('fallback.com', {
                'origin': 'https://origin.com:3000'
            });
            expect(extractDomain(req)).toBe('origin.com');
        });

        it('deve extrair o hostname da URL do origin mesmo com path', () => {
            const req = mockRequest('fallback.com', {
                'origin': 'https://kzn-front-stage-production.up.railway.app/alguma-rota'
            });
            expect(extractDomain(req)).toBe('kzn-front-stage-production.up.railway.app');
        });

        it('deve ignorar Origin malformado e usar hostname como fallback', () => {
            const req = mockRequest('kzn.com', {
                'origin': 'not-a-valid-url'
            });
            expect(extractDomain(req)).toBe('kzn.com');
        });

        it('deve usar x-forwarded-host se fornecido e Origin ausente', () => {
            const req = mockRequest('localhost', {
                'x-forwarded-host': 'prod-kzn.com'
            });
            expect(extractDomain(req)).toBe('prod-kzn.com');
        });

        it('deve extrair o primeiro host se x-forwarded-host contiver multiplos valores', () => {
            const req = mockRequest('localhost', {
                'x-forwarded-host': 'client-domain.com, proxy1.com'
            });
            expect(extractDomain(req)).toBe('client-domain.com');
        });

        it('deve usar req.hostname como fallback se os headers nao existirem', () => {
            expect(extractDomain(mockRequest('alecio.com'))).toBe('alecio.com');
            expect(extractDomain(mockRequest('kzn.com'))).toBe('kzn.com');
            expect(extractDomain(mockRequest('localhost'))).toBe('localhost');
            expect(extractDomain(mockRequest('dev-kzn.local'))).toBe('dev-kzn.local');
        });

        it('deve retornar null se req.hostname e headers nao existirem', () => {
            const req = mockRequest(undefined);
            expect(extractDomain(req)).toBeNull();
        });
    });
    describe('extractBaseUrl', () => {
        const mockRequest = (protocol: string, hostHeader?: string, origin?: string): Request => {
            return {
                protocol,
                headers: {
                    ...(origin ? { origin } : {})
                },
                get: (name: string) => {
                    if (name.toLowerCase() === 'host') return hostHeader;
                    return undefined;
                }
            } as unknown as Request;
        };

        it('deve usar o Origin se fornecido preservando protocolo e porta', () => {
            const req = mockRequest('http', 'localhost:8080', 'http://localhost:8080');
            expect(extractBaseUrl(req)).toBe('http://localhost:8080');
        });

        it('deve extrair https://kzngg.com corretamente', () => {
            const req = mockRequest('https', 'kzngg.com', 'https://kzngg.com');
            expect(extractBaseUrl(req)).toBe('https://kzngg.com');
        });

        it('deve extrair URL com porta customizada em https', () => {
            const req = mockRequest('https', 'kzngg.com:8443', 'https://kzngg.com:8443');
            expect(extractBaseUrl(req)).toBe('https://kzngg.com:8443');
        });

        it('deve ignorar Origin malformado e usar fallback (host)', () => {
            const req = mockRequest('https', 'kzngg.com:8443', 'not-a-valid-url');
            expect(extractBaseUrl(req)).toBe('https://kzngg.com:8443');
        });

        it('deve usar o referer se origin nao existir', () => {
            const req = mockRequest('http', 'localhost:8080');
            req.headers.referer = 'https://kzn-front-stage-production.up.railway.app/dashboard';
            expect(extractBaseUrl(req)).toBe('https://kzn-front-stage-production.up.railway.app');
        });

        it('deve usar x-forwarded-host e x-forwarded-proto se origin e referer nao existirem', () => {
            const req = mockRequest('http', 'api-internal:3000');
            req.headers['x-forwarded-host'] = 'prod-front.com';
            req.headers['x-forwarded-proto'] = 'https';
            expect(extractBaseUrl(req)).toBe('https://prod-front.com');
        });

        it('deve usar req.get(host) como fallback sem Origin, Referer e X-Forwarded-Host', () => {
            const req = mockRequest('http', 'localhost:8080');
            expect(extractBaseUrl(req)).toBe('http://localhost:8080');
        });

        it('deve retornar null se nada for encontrado', () => {
            const req = mockRequest('http');
            expect(extractBaseUrl(req)).toBeNull();
        });
    });
});
