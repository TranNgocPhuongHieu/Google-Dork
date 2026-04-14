import { PlaywrightCrawler, ProxyConfiguration, log } from 'crawlee';
import { getProxyUrls } from './config';

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  source: string;
  engagement: string;
}

/**
 * Callback được gọi mỗi khi parse xong 1 page Google.
 * Nhận danh sách URLs đã dedup (trong session) của page đó.
 * Trả về số URLs thực sự inserted vào DB.
 */
export type OnResultsCallback = (results: SearchResult[], query: string) => Promise<number>;

export interface CrawlerOptions {
  queries: string[];
  maxPages: number;
  onResults: OnResultsCallback;
}

export interface CrawlerStats {
  totalFound: number;
  totalInserted: number;
  totalDuplicates: number;
}

export async function runGoogleCrawler(options: CrawlerOptions): Promise<CrawlerStats> {
  const { queries, maxPages, onResults } = options;

  const proxyUrls = getProxyUrls();
  const proxyConfiguration =
    proxyUrls.length > 0 ? new ProxyConfiguration({ proxyUrls }) : undefined;

  // ── In-memory dedup: lọc URL trùng trong cùng session ──
  const seenUrls = new Set<string>();

  const stats: CrawlerStats = {
    totalFound: 0,
    totalInserted: 0,
    totalDuplicates: 0,
  };

  const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxConcurrency: 1,
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 120,

    async requestHandler({ page, request, log, enqueueLinks }) {
      log.info(`Processing: ${request.url}`);

      // Rate Limit
      const delay = Math.floor(Math.random() * (3000 - 2000 + 1)) + 2000;
      log.info(`[Rate Limit] Sleeping for ${delay}ms...`);
      await page.waitForTimeout(delay);

      try {
        await page.waitForLoadState('networkidle');
      } catch (e) {
        log.warning('Networkidle timeout, checking if body is present...');
      }

      // CAPTCHA check
      const captcha = await page.$('#captcha-form, #recaptcha');
      if (captcha) {
        log.error(`[BLOCKED] CAPTCHA detected on ${request.url}`);
        throw new Error('CAPTCHA blocked');
      }

      // Soft-block check
      const pageText = await page.evaluate(() => document.body.innerText);
      if (
        pageText.includes('bất thường từ mạng máy tính') ||
        pageText.includes('unusual traffic') ||
        pageText.includes('Our systems have detected')
      ) {
        log.error(`[BLOCKED] Soft-block (Unusual traffic) detected on ${request.url}`);
        throw new Error('Soft blocked by Google');
      }

      // Parse kết quả
      const results = await page.$$eval('#search h3', (h3Elements) => {
        const parsed: { url: string; title: string; snippet: string; source: string; engagement: string }[] = [];
        for (const h3 of h3Elements) {
          const linkElem = h3.closest('a');
          if (!linkElem) continue;

          let url = linkElem.href;
          if (url.includes('/url?')) {
            try {
              const u = new URL(url);
              url = u.searchParams.get('q') || u.searchParams.get('url') || url;
            } catch (e) {}
          }
          if (!url || url.startsWith('/') || url.includes('google.com')) continue;

          const title = (h3 as HTMLElement).innerText;
          let container =
            linkElem.closest('div.g, div.MjjYud, div.v7W49e') ||
            linkElem.parentElement?.parentElement?.parentElement;

          let snippet = '';
          let source = '';
          let engagement = '';

          if (container) {
            const snippetElem = container.querySelector(
              'div.VwiC3b, div[style*="-webkit-line-clamp"]',
            );
            if (snippetElem) {
              snippet = (snippetElem as HTMLElement).innerText;
            }

            const spans = Array.from(container.querySelectorAll('span, cite, div'));
            for (const s of spans) {
              const t = (s as HTMLElement).innerText;
              if (
                t &&
                t.includes('·') &&
                (t.includes('Facebook') || t.includes('Instagram') || t.includes('X'))
              ) {
                source = t;
              }
              if (
                t &&
                t.includes('lượt') &&
                (t.includes('cảm xúc') || t.includes('thích') || t.includes('bày tỏ'))
              ) {
                engagement = t;
              }
            }
          }

          parsed.push({
            url: decodeURIComponent(url),
            title,
            snippet,
            source,
            engagement,
          });
        }
        return parsed;
      });

      log.info(`Page parsed: ${results.length} results`);

      // Debug screenshot nếu 0 kết quả
      if (results.length === 0) {
        const fs = require('fs');
        const path = require('path');
        const debugPath = path.join(process.cwd(), `debug_empty_${Date.now()}.png`);
        await page.screenshot({ path: debugPath });
        log.warning(`Took screenshot of empty response: ${debugPath}`);
      }

      // ── Dedup in-memory + push ngay vào DB ──
      const queryLabel = request.userData.query;
      const uniqueResults: SearchResult[] = [];

      for (const res of results) {
        if (seenUrls.has(res.url)) {
          stats.totalDuplicates++;
          continue;
        }
        seenUrls.add(res.url);
        uniqueResults.push(res);
      }

      stats.totalFound += results.length;

      // Push ngay vào DB qua callback (cào tới đâu push tới đó)
      if (uniqueResults.length > 0) {
        const inserted = await onResults(uniqueResults, queryLabel);
        stats.totalInserted += inserted;
        // Số URL bị trùng ở DB (đã tồn tại từ lần cào trước)
        const dbDuplicates = uniqueResults.length - inserted;
        stats.totalDuplicates += dbDuplicates;

        log.info(
          `[DB] ${uniqueResults.length} unique → ${inserted} inserted, ${dbDuplicates} already in DB`,
        );
      }

      // Pagination
      const currentPage = request.userData.page || 1;
      if (currentPage < maxPages) {
        const nextBtn = await page.$('a#pnnext');
        if (nextBtn) {
          const href = await nextBtn.getAttribute('href');
          if (href) {
            const nextUrl = `https://www.google.com${href}`;
            log.info(`Enqueuing next page: ${nextUrl}`);
            await enqueueLinks({
              urls: [nextUrl],
              userData: {
                label: 'PAGINATION',
                query: queryLabel,
                page: currentPage + 1,
              },
            });
          }
        } else {
          log.info(`No next button found. Stopping pagination for ${queryLabel}.`);
        }
      }
    },

    failedRequestHandler({ request, log }) {
      log.error(`Request ${request.url} failed completely.`);
    },
  });

  // Chuẩn bị requests
  const initialRequests = queries.map((q) => ({
    url: `https://www.google.com/search?q=${encodeURIComponent(q)}&num=10&hl=vi`,
    userData: { query: q, page: 1, label: 'SEARCH' },
  }));

  await crawler.addRequests(initialRequests);
  log.info(`Starting crawler with ${initialRequests.length} queries`);

  await crawler.run();

  log.info(
    `Crawler done: ${stats.totalFound} found, ${stats.totalInserted} inserted, ${stats.totalDuplicates} duplicates`,
  );

  return stats;
}
