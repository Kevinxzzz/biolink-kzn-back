import { extractDomain, normalizeDomain } from './domain';
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
});
