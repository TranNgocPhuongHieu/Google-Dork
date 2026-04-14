export class Deduplicator {
    private seenUrls: Set<string> = new Set();

    loadFromResults(resultsDir: string) {
        import('fs').then(fs => {
            import('path').then(path => {
                if (!fs.existsSync(resultsDir)) return;
                const files = fs.readdirSync(resultsDir);
                let count = 0;
                for (const file of files) {
                    if (!file.endsWith('.json')) continue;
                    try {
                        const content = fs.readFileSync(path.join(resultsDir, file), 'utf-8');
                        const parsed = JSON.parse(content);
                        if (parsed.data && Array.isArray(parsed.data)) {
                            for (const item of parsed.data) {
                                if (item.url) {
                                    this.seenUrls.add(item.url);
                                    count++;
                                }
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }
                import('crawlee').then(({ log }) => {
                    log.info(`Loaded ${count} existing URLs for cross-run dedup`);
                });
            });
        });
    }

    // load sync version
    loadFromResultsSync(resultsDir: string) {
        const fs = require('fs');
        const path = require('path');
        if (!fs.existsSync(resultsDir)) return;
        const files = fs.readdirSync(resultsDir);
        let count = 0;
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const content = fs.readFileSync(path.join(resultsDir, file), 'utf-8');
                const parsed = JSON.parse(content);
                if (parsed.data && Array.isArray(parsed.data)) {
                    for (const item of parsed.data) {
                        if (item.url) {
                            this.seenUrls.add(item.url);
                            count++;
                        }
                    }
                }
            } catch (e) {
                // ignore
            }
        }
        const { log } = require('crawlee');
        log.info(`🔃 Loaded ${count} existing URLs from ${resultsDir}`);
    }

    add(url: string) {
        this.seenUrls.add(url);
    }

    isDuplicate(url: string): boolean {
        return this.seenUrls.has(url);
    }
}
