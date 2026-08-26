/**
 * Retorna a data atual zerada (00:00:00.000Z) correspondente ao dia no fuso horário de Brasília (America/Sao_Paulo).
 */
export function getTodayBRTReferenceDate(): Date {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;

    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}
