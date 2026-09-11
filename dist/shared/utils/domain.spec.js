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
        const mockRequest = (hostname, headers = {}) => {
            return {
                hostname: hostname,
                headers: headers
            };
        };
        it('deve usar o Origin se fornecido', () => {
            const req = mockRequest('fallback.com', {
                'origin': 'https://origin.com:3000'
            });
            expect((0, domain_1.extractDomain)(req)).toBe('origin.com');
        });
        it('deve extrair o hostname da URL do origin mesmo com path', () => {
            const req = mockRequest('fallback.com', {
                'origin': 'https://kzn-front-stage-production.up.railway.app/alguma-rota'
            });
            expect((0, domain_1.extractDomain)(req)).toBe('kzn-front-stage-production.up.railway.app');
        });
        it('deve ignorar Origin malformado e usar hostname como fallback', () => {
            const req = mockRequest('kzn.com', {
                'origin': 'not-a-valid-url'
            });
            expect((0, domain_1.extractDomain)(req)).toBe('kzn.com');
        });
        it('deve usar req.hostname como fallback se os headers nao existirem', () => {
            expect((0, domain_1.extractDomain)(mockRequest('alecio.com'))).toBe('alecio.com');
            expect((0, domain_1.extractDomain)(mockRequest('kzn.com'))).toBe('kzn.com');
            expect((0, domain_1.extractDomain)(mockRequest('localhost'))).toBe('localhost');
            expect((0, domain_1.extractDomain)(mockRequest('dev-kzn.local'))).toBe('dev-kzn.local');
        });
        it('deve retornar null se req.hostname e headers nao existirem', () => {
            const req = mockRequest(undefined);
            expect((0, domain_1.extractDomain)(req)).toBeNull();
        });
    });
});
