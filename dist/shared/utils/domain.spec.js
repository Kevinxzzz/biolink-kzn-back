"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const domain_1 = require("./domain");
describe('Domain Utils', () => {
    describe('normalizeDomain', () => {
        it('deve remover http:// e https://', () => {
            expect((0, domain_1.normalizeDomain)('http://kzn.com')).toBe('kzn.com');
            expect((0, domain_1.normalizeDomain)('https://alecio.com')).toBe('alecio.com');
        });
        it('deve remover a porta', () => {
            expect((0, domain_1.normalizeDomain)('http://localhost:3000')).toBe('localhost');
            expect((0, domain_1.normalizeDomain)('localhost:3001')).toBe('localhost');
        });
        it('deve remover paths e barras invertidas', () => {
            expect((0, domain_1.normalizeDomain)('https://kzn.com/')).toBe('kzn.com');
            expect((0, domain_1.normalizeDomain)('https://kzn.com/api/v1')).toBe('kzn.com');
            expect((0, domain_1.normalizeDomain)('alecio.com/alguma/rota')).toBe('alecio.com');
        });
        it('deve retornar em lower case', () => {
            expect((0, domain_1.normalizeDomain)('HTTPS://KZN.COM')).toBe('kzn.com');
        });
        it('deve retornar string vazia para entrada falsy', () => {
            expect((0, domain_1.normalizeDomain)('')).toBe('');
        });
    });
    describe('extractDomain', () => {
        const mockRequest = (hostname) => {
            return {
                hostname: hostname
            };
        };
        it('deve usar req.hostname e normalizar domínios de produção', () => {
            expect((0, domain_1.extractDomain)(mockRequest('alecio.com'))).toBe('alecio.com');
            expect((0, domain_1.extractDomain)(mockRequest('kzn.com'))).toBe('kzn.com');
        });
        it('deve usar req.hostname e normalizar domínios de desenvolvimento locais', () => {
            expect((0, domain_1.extractDomain)(mockRequest('localhost'))).toBe('localhost');
            expect((0, domain_1.extractDomain)(mockRequest('dev-kzn.local'))).toBe('dev-kzn.local');
            expect((0, domain_1.extractDomain)(mockRequest('dev-alecio.local'))).toBe('dev-alecio.local');
        });
        it('deve retornar null se req.hostname nao existir', () => {
            const req = mockRequest(undefined);
            expect((0, domain_1.extractDomain)(req)).toBeNull();
        });
    });
});
