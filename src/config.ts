import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { ProxyConfigurationOptions } from 'crawlee';

dotenv.config();

function parseEnvJSON(key: string, defaultVal: any): any {
    try {
        const val = process.env[key];
        if (!val) return defaultVal;
        return JSON.parse(val);
    } catch {
        return defaultVal;
    }
}

export const ROTATING_PROXY_DICT = parseEnvJSON("ROTATING_PROXY_DICT", {});
export const PROXY_LIST = parseEnvJSON("PROXY_LIST", []);

// Parse proxies into format supported by Crawlee
export function getProxyUrls(): string[] {
    const urls: string[] = [];

    // Crawlee ProxyConfiguration format: http://username:password@host:port
    for (const proxy of PROXY_LIST) {
        if (proxy.host && proxy.port && proxy.user && proxy.password) {
            urls.push(`http://${proxy.user}:${proxy.password}@${proxy.host}:${proxy.port}`);
        }
    }

    // Include rotating proxy if exists
    if (ROTATING_PROXY_DICT && ROTATING_PROXY_DICT.ROTATING_PROXY_HOST) {
        const p = ROTATING_PROXY_DICT;
        const host = p.ROTATING_PROXY_IP || p.ROTATING_PROXY_HOST;
        urls.push(`http://${p.ROTATING_PROXY_USER}:${p.ROTATING_PROXY_PASS}@${host}:${p.ROTATING_PROXY_PORT}`);
    }

    return urls;
}

export const SEARCH_DELAY_MIN = 5000;
export const SEARCH_DELAY_MAX = 10000;
