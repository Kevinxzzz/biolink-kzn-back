"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextEligibleLink = getNextEligibleLink;
/**
 * Encontra o próximo link elegível para rotação em uma categoria.
 * Regras:
 * - Filtra por inRotationPool = true
 * - Ordena por order ASC
 * - Encontra o próximo link que tenha order maior que o link atual
 * - Se não houver próximo (chegou ao fim), faz o loop e pega o primeiro elegível
 */
async function getNextEligibleLink(tx, enterpriseId, categoryId, currentLink) {
    const nextLinks = await tx.enterpriseUrl.findMany({
        where: { enterpriseId, categoryId, inRotationPool: true },
        orderBy: { order: 'asc' }
    });
    let nextLink = nextLinks.find((l) => l.order > currentLink.order && l.id !== currentLink.id);
    if (!nextLink) {
        // Wrap-around: pega o primeiro que não seja o atual
        nextLink = nextLinks.find((l) => l.id !== currentLink.id);
    }
    return nextLink || null;
}
