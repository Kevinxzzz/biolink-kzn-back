import { enterpriseUrl } from "@prisma/client";

/**
 * Encontra o próximo link elegível para rotação em uma categoria.
 * Regras:
 * - Filtra por inRotationPool = true
 * - Ordena por order ASC
 * - Encontra o próximo link que tenha order maior que o link atual
 * - Se não houver próximo (chegou ao fim), faz o loop e pega o primeiro elegível
 */
export async function getNextEligibleLink(
    tx: any, 
    enterpriseId: string, 
    categoryId: string, 
    currentLink: enterpriseUrl
): Promise<enterpriseUrl | null> {
    const nextLinks = await tx.enterpriseUrl.findMany({
        where: { enterpriseId, categoryId, inRotationPool: true },
        orderBy: { order: 'asc' }
    });

    let nextLink = nextLinks.find((l: enterpriseUrl) => l.order > currentLink.order && l.id !== currentLink.id);
    
    if (!nextLink) {
        // Wrap-around: pega o primeiro que não seja o atual
        nextLink = nextLinks.find((l: enterpriseUrl) => l.id !== currentLink.id);
    }

    return nextLink || null;
}
