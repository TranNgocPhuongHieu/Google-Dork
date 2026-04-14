import { buildQueries } from './src/query_builder';
import { runGoogleCrawler, SearchResult } from './src/crawler';
import {
  loadPlatformCache,
  resolvePlatformId,
  getOrCreateKeyword,
  extractPostId,
  insertPosts,
  closeDb,
} from './src/db';
import { log } from 'crawlee';

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

  // ── 1. Init DB ──
  await loadPlatformCache();
  const keywordId = await getOrCreateKeyword(keyword);
  log.info(`Keyword "${keyword}" → keyword_id = ${keywordId}`);

  // ── 2. Build queries + mapping query → site domain ──
  const queriesData = buildQueries(sites, keyword, dateFrom, dateTo, splitDays);

  // Map: query string → site domain (để callback biết URL thuộc platform nào)
  const queryToSite = new Map<string, string>();
  for (const qd of queriesData) {
    queryToSite.set(qd.query, qd.site);
  }

  // ── 3. Crawl + push ngay vào DB qua callback ──
  const stats = await runGoogleCrawler({
    queries: queriesData.map((q) => q.query),
    maxPages,
    onResults: async (results: SearchResult[], query: string): Promise<number> => {
      const site = queryToSite.get(query);
      if (!site) {
        log.warning(`Unknown query mapping: ${query}`);
        return 0;
      }

      const platformId = resolvePlatformId(site);

      const posts = results.map((item) => ({
        postId: extractPostId(item.url, site),
        url: item.url,
      }));

      return insertPosts(posts, platformId, keywordId);
    },
  });

  log.info(
    `Hoàn thành! Found: ${stats.totalFound}, Inserted: ${stats.totalInserted}, Duplicates: ${stats.totalDuplicates}`,
  );

  // ── 4. Cleanup ──
  await closeDb();
}

main().catch(async (e) => {
  log.error(`Unhandled error: ${e}`);
  await closeDb().catch(() => {});
  process.exit(1);
});
