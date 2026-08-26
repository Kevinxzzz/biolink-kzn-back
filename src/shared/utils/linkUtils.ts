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
        orderBy: [
            { order: 'asc' },
            { createAt: 'asc' },
            { id: 'asc' }
        ]
    });

    if (nextLinks.length === 0) {
        return null;
    }

    if (nextLinks.length === 1 && nextLinks[0].id === currentLink.id) {
        return null;
    }

    const currentIndex = nextLinks.findIndex((l: enterpriseUrl) => l.id === currentLink.id);

    if (currentIndex === -1) {
        // O link atual não está na pool elegível, rotaciona para o primeiro disponível
        return nextLinks[0];
    }

    const nextIndex = (currentIndex + 1) % nextLinks.length;
    return nextLinks[nextIndex];
}
