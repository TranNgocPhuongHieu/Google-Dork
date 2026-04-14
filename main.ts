import { buildQueries } from './src/query_builder';
import { runGoogleCrawler } from './src/crawler';
import { Deduplicator } from './src/dedup';
import { log } from 'crawlee';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

import 'dotenv/config';

const SEARCH_CONFIG = {
    sites: process.env.SEARCH_SITES ? process.env.SEARCH_SITES.split(',').map((s) => s.trim()) : [],
    keyword: process.env.SEARCH_KEYWORD || '',
    dateFrom: process.env.SEARCH_DATE_FROM || '',
    dateTo: process.env.SEARCH_DATE_TO || '',
    splitDays: parseInt(process.env.SEARCH_SPLIT_DAYS || '4', 10),
    maxPages: parseInt(process.env.SEARCH_MAX_PAGES || '10000', 10),
};

async function main() {
    log.setLevel(log.LEVELS.INFO);
    const { sites, keyword, dateFrom, dateTo, splitDays, maxPages } = SEARCH_CONFIG;

    if (!sites.length || !keyword || !dateFrom || !dateTo) {
        log.error('Thiếu thông số tìm kiếm trong file config');
        process.exit(1);
    }

    const queriesData = buildQueries(sites, keyword, dateFrom, dateTo, splitDays);
    const resultsMap = await runGoogleCrawler(
        queriesData.map((q) => q.query),
        maxPages,
    );

    const dedup = new Deduplicator();
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
    dedup.loadFromResultsSync(resultsDir);

    const resultsBySite: Record<string, any[]> = {};

    for (const qd of queriesData) {
        const resList = resultsMap[qd.query] || [];
        const uniqueList = resList
            .filter((item) => {
                if (!dedup.isDuplicate(item.url)) {
                    dedup.add(item.url);
                    return true;
                }
                return false;
            })
            .map((item) => ({
                ...item,
                part: qd.weekLabel,
                dateFrom: qd.dateFrom,
                dateTo: qd.dateTo,
            }));

        if (uniqueList.length > 0) {
            if (!resultsBySite[qd.site]) resultsBySite[qd.site] = [];
            resultsBySite[qd.site].push(...uniqueList);
        }
    }

    // Lưu file
    for (const site of Object.keys(resultsBySite)) {
        const resList = resultsBySite[site];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeSite = site.replace('.', '_');

        // 1. Lưu JSON
        const jsonFile = path.join(resultsDir, `${safeSite}_${timestamp}.json`);
        fs.writeFileSync(
            jsonFile,
            JSON.stringify(
                {
                    site,
                    keyword,
                    total: resList.length,
                    data: resList,
                },
                null,
                2,
            ),
        );

        // 2. Lưu Excel (XLSX)
        const excelFile = path.join(resultsDir, `${safeSite}_${timestamp}.xlsx`);
        const worksheet = XLSX.utils.json_to_sheet(resList);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
        XLSX.writeFile(workbook, excelFile);

        log.info(`✅ Đã lưu ${resList.length} kết quả vào ${jsonFile} và .xlsx`);
    }

    log.info('🚀 Hoàn thành crawl dữ liệu!');
}

main().catch((e) => {
    log.error(`Unhandled error: ${e}`);
    process.exit(1);
});
