export const SITE_ALIASES: Record<string, string> = {
    "facebook": "facebook.com",
    "fb": "facebook.com",
    "instagram": "instagram.com",
    "ig": "instagram.com",
    "twitter": "x.com",
    "x": "x.com",
};

export function normalizeSite(site: string): string {
    const s = site.toLowerCase().trim();
    return SITE_ALIASES[s] || s;
}

export function buildSingleQuery(site: string, keyword: string, dateFrom: string, dateTo: string): string {
    const s = normalizeSite(site);
    return `site:${s} ${keyword} after:${dateFrom} before:${dateTo}`;
}

export function splitDateRange(dateFrom: string, dateTo: string, splitDays: number = 4): Array<[string, string]> {
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    const chunks: Array<[string, string]> = [];

    let current = new Date(start);
    while (current < end) {
        const chunkEnd = new Date(current);
        chunkEnd.setDate(current.getDate() + splitDays);
        const actualEnd = chunkEnd < end ? chunkEnd : end;

        // after is exclusive, before is exclusive
        const afterDate = new Date(current);
        afterDate.setDate(current.getDate() - 1);

        const beforeDate = new Date(actualEnd);
        beforeDate.setDate(actualEnd.getDate() + 1);

        chunks.push([
            afterDate.toISOString().split('T')[0],
            beforeDate.toISOString().split('T')[0]
        ]);

        current = new Date(actualEnd);
    }
    return chunks;
}

export function buildQueries(sites: string[], keyword: string, dateFrom: string, dateTo: string, splitDays: number = 4) {
    const queries: Array<{ query: string, site: string, keyword: string, weekLabel: string, dateFrom: string, dateTo: string }> = [];

    for (const site of sites) {
        const normSite = normalizeSite(site);
        if (splitDays > 0) {
            const chunks = splitDateRange(dateFrom, dateTo, splitDays);
            chunks.forEach(([chunkFrom, chunkTo], i) => {
                queries.push({
                    query: buildSingleQuery(normSite, keyword, chunkFrom, chunkTo),
                    site: normSite,
                    keyword,
                    dateFrom: chunkFrom,
                    dateTo: chunkTo,
                    weekLabel: `P${i + 1}`
                });
            });
        } else {
            const afterDate = new Date(dateFrom);
            afterDate.setDate(afterDate.getDate() - 1);
            const beforeDate = new Date(dateTo);
            beforeDate.setDate(beforeDate.getDate() + 1);

            queries.push({
                query: buildSingleQuery(normSite, keyword, afterDate.toISOString().split('T')[0], beforeDate.toISOString().split('T')[0]),
                site: normSite,
                keyword,
                dateFrom: afterDate.toISOString().split('T')[0],
                dateTo: beforeDate.toISOString().split('T')[0],
                weekLabel: "ALL"
            });
        }
    }
    return queries;
}
