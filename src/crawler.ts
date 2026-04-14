import { PlaywrightCrawler, ProxyConfiguration, log } from 'crawlee';
import { getProxyUrls } from './config';

export interface SearchResult {
    url: string;
    title: string;
    snippet: string;
    source: string;
    engagement: string;
}

export async function runGoogleCrawler(queries: string[], maxPages: number): Promise<Record<string, SearchResult[]>> {
    const proxyUrls = getProxyUrls();
    const proxyConfiguration = proxyUrls.length > 0
        ? new ProxyConfiguration({ proxyUrls })
        : undefined;

    const allResults: Record<string, SearchResult[]> = {};

    const crawler = new PlaywrightCrawler({
        proxyConfiguration,
        // Chạy tối đa 1 query + pagination cùng lúc để tránh bị block quá nhanh
        maxConcurrency: 1,
        navigationTimeoutSecs: 60,
        requestHandlerTimeoutSecs: 120, // thời gian tối đa cho 1 page bao gồm cả wait

        async requestHandler({ page, request, log, enqueueLinks }) {
            log.info(`Processing: ${request.url}`);

            // Rate Limit: Nghỉ ngẫu nhiên 2 đến 3 giây để giảm thời gian chờ
            const delay = Math.floor(Math.random() * (3000 - 2000 + 1)) + 2000;
            log.info(`[Rate Limit] Sleeping for ${delay}ms...`);
            await page.waitForTimeout(delay);

            // Đợi load xong. Playwright sẽ tự do JS challenge execute và reload trang.
            try {
                await page.waitForLoadState('networkidle');
            } catch (e) {
                log.warning('Networkidle timeout, checking if body is present...');
            }

            // Kiểm tra bị block captcha ko
            const captcha = await page.$('#captcha-form, #recaptcha');
            if (captcha) {
                log.error(`[BLOCKED] CAPTCHA detected on ${request.url}`);
                throw new Error("CAPTCHA blocked"); // throw để Crawlee retry với proxy khác
            }

            const pageText = await page.evaluate(() => document.body.innerText);
            if (pageText.includes('bất thường từ mạng máy tính') || pageText.includes('unusual traffic') || pageText.includes('Our systems have detected')) {
                log.error(`[BLOCKED] Soft-block (Unusual traffic) detected on ${request.url}`);
                throw new Error("Soft blocked by Google");
            }

            // Parse kết quả bằng cách tìm trực tiếp thẻ H3 thay vì phụ thuộc vào div wrapper
            const results = await page.$$eval('#search h3', (h3Elements) => {
                const parsed: SearchResult[] = [];
                for (const h3 of h3Elements) {
                    const linkElem = h3.closest('a');
                    if (!linkElem) continue;

                    let url = linkElem.href;
                    // Bỏ /url?q= nếu có
                    if (url.includes('/url?')) {
                        try {
                            const u = new URL(url);
                            url = u.searchParams.get('q') || u.searchParams.get('url') || url;
                        } catch (e) { }
                    }
                    if (!url || url.startsWith('/') || url.includes('google.com')) continue;

                    const title = (h3 as HTMLElement).innerText;

                    // Đoán container bọc nó để tìm snippet
                    let container = linkElem.closest('div.g, div.MjjYud, div.v7W49e') || linkElem.parentElement?.parentElement?.parentElement;

                    let snippet = '';
                    let source = '';
                    let engagement = '';

                    if (container) {
                        const snippetElem = container.querySelector('div.VwiC3b, div[style*="-webkit-line-clamp"]');
                        if (snippetElem) {
                            snippet = (snippetElem as HTMLElement).innerText;
                        }

                        const spans = Array.from(container.querySelectorAll('span, cite, div'));
                        for (const s of spans) {
                            const t = (s as HTMLElement).innerText;
                            if (t && t.includes('·') && (t.includes('Facebook') || t.includes('Instagram') || t.includes('X'))) {
                                source = t;
                            }
                            if (t && t.includes('lượt') && (t.includes('cảm xúc') || t.includes('thích') || t.includes('bày tỏ'))) {
                                engagement = t;
                            }
                        }
                    }

                    parsed.push({
                        url: decodeURIComponent(url),
                        title,
                        snippet,
                        source,
                        engagement
                    });
                }
                return parsed;
            });

            log.info(`Page parsed: ${results.length} results`);

            // DEBUG SCREESHOT
            if (results.length === 0) {
                const fs = require('fs');
                const path = require('path');
                const debugPath = path.join(process.cwd(), `debug_empty_${Date.now()}.png`);
                await page.screenshot({ path: debugPath });
                log.warning(`Took screenshot of empty response: ${debugPath}`);
            }

            // Lưu kết quả vào biến local
            const queryLabel = request.userData.query;
            if (!allResults[queryLabel]) {
                allResults[queryLabel] = [];
            }
            // Dedup in-request
            for (const res of results) {
                if (!allResults[queryLabel].find(r => r.url === res.url)) {
                    allResults[queryLabel].push(res);
                }
            }

            // Pagination Handling
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
                                page: currentPage + 1
                            }
                        });
                    }
                } else {
                    log.info(`No next button found. Stopping pagination for ${queryLabel}.`);
                }
            }
        },
        // Hook để xử lý khi bị fail quá nhiều lần
        failedRequestHandler({ request, log }) {
            log.error(`Request ${request.url} failed completely.`);
        },
    });

    // Chuẩn bị danh sách requests ban đầu
    const initialRequests = queries.map(q => ({
        url: `https://www.google.com/search?q=${encodeURIComponent(q)}&num=10&hl=vi`,
        userData: { query: q, page: 1, label: 'SEARCH' }
    }));

    await crawler.addRequests(initialRequests);
    log.info(`Starting crawler with ${initialRequests.length} queries`);

    await crawler.run();
    return allResults;
}
