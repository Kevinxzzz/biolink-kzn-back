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
        const mockRequest = (hostname?: string): Request => {
            return {
                hostname: hostname
            } as Request;
        };

        it('deve usar req.hostname e normalizar domínios de produção', () => {
            expect(extractDomain(mockRequest('alecio.com'))).toBe('alecio.com');
            expect(extractDomain(mockRequest('kzn.com'))).toBe('kzn.com');
        });

        it('deve usar req.hostname e normalizar domínios de desenvolvimento locais', () => {
            expect(extractDomain(mockRequest('localhost'))).toBe('localhost');
            expect(extractDomain(mockRequest('dev-kzn.local'))).toBe('dev-kzn.local');
            expect(extractDomain(mockRequest('dev-alecio.local'))).toBe('dev-alecio.local');
        });

        it('deve retornar null se req.hostname nao existir', () => {
            const req = mockRequest(undefined);
            expect(extractDomain(req)).toBeNull();
        });
    });
});
