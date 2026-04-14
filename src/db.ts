import { Pool } from 'pg';
import { log } from 'crawlee';

// ─── Connection Pool ───────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/** Đóng pool khi kết thúc chương trình */
export async function closeDb(): Promise<void> {
  await pool.end();
}

// ─── Platform cache (lookup 1 lần khi khởi động) ──────────

const platformCache = new Map<string, number>(); // domain → platform_id

/** Load toàn bộ dim_platform vào memory */
export async function loadPlatformCache(): Promise<void> {
  const { rows } = await pool.query<{ platform_id: number; domain: string }>(
    'SELECT platform_id, domain FROM dim_platform',
  );
  for (const row of rows) {
    platformCache.set(row.domain, row.platform_id);
  }
  log.info(`Loaded ${platformCache.size} platforms from DB`);
}

/** Resolve domain → platform_id từ cache */
export function resolvePlatformId(domain: string): number {
  const id = platformCache.get(domain);
  if (id === undefined) {
    throw new Error(`Platform not found for domain: ${domain}`);
  }
  return id;
}

// ─── Keyword ───────────────────────────────────────────────

/** Upsert keyword, trả về keyword_id */
export async function getOrCreateKeyword(keyword: string): Promise<number> {
  // Thử INSERT trước
  const insertResult = await pool.query<{ keyword_id: number }>(
    `INSERT INTO dim_keyword (keyword)
     VALUES ($1)
     ON CONFLICT (keyword) DO NOTHING
     RETURNING keyword_id`,
    [keyword],
  );

  if (insertResult.rows.length > 0) {
    return insertResult.rows[0].keyword_id;
  }

  // Đã tồn tại → SELECT
  const selectResult = await pool.query<{ keyword_id: number }>(
    'SELECT keyword_id FROM dim_keyword WHERE keyword = $1',
    [keyword],
  );
  return selectResult.rows[0].keyword_id;
}

// ─── Post ID extraction ────────────────────────────────────

/**
 * Extract post ID gốc từ URL theo platform.
 * Trả về null nếu URL không phải bài post hợp lệ → sẽ bị bỏ qua, không insert vào DB.
 *
 * Facebook: post ID là chuỗi số >= 10 digits ở cuối URL path.
 *   /page/posts/text-slug/1236060595371522/  → "1236060595371522"
 *   /groups/341951053297626/posts/2284945865664792/ → "2284945865664792"
 *   /page/photos/hash/1550488673747557/      → "1550488673747557"
 *   /page/videos/text/1729623328411351/      → "1729623328411351"
 *   /story.php?story_fbid=123456             → "123456"
 *   /watch/?v=123456                         → "123456"
 *   /photo.php?fbid=123456                   → "123456"
 *   pfbid... (obfuscated ID)                 → "pfbid..."
 *   /?locale=fo_FO (page URL, không phải post) → null
 *
 * Instagram: shortcode sau /p/, /reel/, /tv/
 *   /p/CxYz123AbCd/    → "CxYz123AbCd"
 *   /reel/CxYz123AbCd/ → "CxYz123AbCd"
 *   /username/ (profile) → null
 *
 * X/Twitter: tweet ID (số) sau /status/
 *   /user/status/1234567890123456789 → "1234567890123456789"
 *   /home, /explore (không phải tweet) → null
 */
export function extractPostId(url: string, domain: string): string | null {
  try {
    const u = new URL(url);

    if (domain === 'facebook.com') {
      // Query params (story_fbid, v, fbid)
      const storyFbid = u.searchParams.get('story_fbid');
      if (storyFbid) return storyFbid;

      const watchV = u.searchParams.get('v');
      if (watchV) return watchV;

      const fbid = u.searchParams.get('fbid');
      if (fbid) return fbid;

      // pfbid (obfuscated ID)
      const pfbidMatch = u.pathname.match(/(pfbid[a-zA-Z0-9]+)/);
      if (pfbidMatch) return pfbidMatch[1];

      // Số >= 10 digits ở cuối path = post ID thật
      const segments = u.pathname.split('/').filter(Boolean);
      for (let i = segments.length - 1; i >= 0; i--) {
        if (/^\d{10,}$/.test(segments[i])) {
          return segments[i];
        }
      }

      // Không tìm được ID → URL không phải bài post
      return null;
    }

    if (domain === 'instagram.com') {
      const igMatch = u.pathname.match(/\/(p|reel|tv)\/([^/?]+)/);
      if (igMatch) return igMatch[2];
      return null;
    }

    if (domain === 'x.com') {
      const xMatch = u.pathname.match(/\/status\/(\d+)/);
      if (xMatch) return xMatch[1];
      return null;
    }
  } catch {
    // URL parse fail
  }

  return null;
}

// ─── Bulk Insert Posts ─────────────────────────────────────

interface PostInsert {
  postId: string;
  url: string;
}

/**
 * Bulk insert posts vào fact_post.
 * ON CONFLICT (post_id) DO NOTHING → tự dedup.
 * Trả về số row thực sự inserted.
 */
export async function insertPosts(
  posts: PostInsert[],
  platformId: number,
  keywordId: number,
): Promise<number> {
  if (posts.length === 0) return 0;

  // Build multi-row INSERT
  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < posts.length; i++) {
    const offset = i * 4;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
    values.push(posts[i].postId, posts[i].url, platformId, keywordId);
  }

  const result = await pool.query(
    `INSERT INTO fact_post (post_id, url, platform_id, keyword_id)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (post_id) DO NOTHING`,
    values,
  );

  return result.rowCount ?? 0;
}

// ─── Functions cho site crawlers (tương lai) ───────────────

export interface UnscrapedPost {
  post_id: string;
  url: string;
}

/** Lấy danh sách URLs chưa cào metadata theo platform */
export async function getUnscrapedPosts(
  platformId: number,
  limit: number = 100,
): Promise<UnscrapedPost[]> {
  const { rows } = await pool.query<UnscrapedPost>(
    `SELECT post_id, url FROM fact_post
     WHERE platform_id = $1
       AND content_scraped = FALSE
       AND scrape_attempts < 3
     ORDER BY created_at ASC
     LIMIT $2`,
    [platformId, limit],
  );
  return rows;
}

export interface PostContentUpdate {
  authorName?: string;
  contentText?: string;
  publishedAt?: Date;
  reactionCount?: number;
  commentCount?: number;
  shareCount?: number;
}

/** Update metadata sau khi site crawler cào xong */
export async function updatePostContent(
  postId: string,
  data: PostContentUpdate,
): Promise<void> {
  await pool.query(
    `UPDATE fact_post SET
       author_name      = $2,
       content_text     = $3,
       published_at     = $4,
       reaction_count   = $5,
       comment_count    = $6,
       share_count      = $7,
       content_scraped  = TRUE,
       scraped_at       = NOW(),
       updated_at       = NOW()
     WHERE post_id = $1`,
    [
      postId,
      data.authorName ?? null,
      data.contentText ?? null,
      data.publishedAt ?? null,
      data.reactionCount ?? null,
      data.commentCount ?? null,
      data.shareCount ?? null,
    ],
  );
}

/** Ghi lỗi khi site crawler cào fail */
export async function markScrapeFailed(
  postId: string,
  error: string,
): Promise<void> {
  await pool.query(
    `UPDATE fact_post SET
       scrape_attempts   = scrape_attempts + 1,
       last_scrape_error = $2,
       updated_at        = NOW()
     WHERE post_id = $1`,
    [postId, error],
  );
}
