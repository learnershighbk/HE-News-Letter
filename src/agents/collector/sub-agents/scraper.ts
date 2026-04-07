// ============================================================
// KDIS News Curator - Scraper Sub-Agent
// Cheerio 기반 정적 HTML 스크래핑 서브 에이전트
// ============================================================

import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import type { NewsItem, NewsSource, SourceResult, AgentError, ScrapingSelectors } from '../../../shared/types.js';
import { withRetry } from '../../../shared/retry.js';
import { Logger } from '../../../shared/logger.js';

const logger = new Logger('collector:scraper');

/** 소스당 최대 아이템 수 */
const MAX_ITEMS_PER_SOURCE = 20;

/** fetch 타임아웃 (ms) */
const FETCH_TIMEOUT = 10000;

/** p-limit 동시 실행 수 (스크래핑은 리소스 부담이 크므로 제한적) */
const CONCURRENCY_LIMIT = 3;

export class ScraperSubAgent {
  /**
   * 단일 소스에서 스크래핑으로 뉴스를 수집한다.
   * fetch + Cheerio로 정적 HTML 파싱
   */
  async fetchFromSource(source: NewsSource): Promise<{
    items: NewsItem[];
    sourceResult: SourceResult;
  }> {
    if (!source.selectors) {
      return {
        items: [],
        sourceResult: {
          source: source.name,
          success: false,
          itemCount: 0,
          error: 'selectors가 설정되지 않았습니다.',
        },
      };
    }

    logger.info(`스크래핑 시작: ${source.name}`, { url: source.url });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'KDIS-News-Curator/1.0',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const items = this.parseWithCheerio(html, source);

      logger.info(`스크래핑 완료: ${source.name}`, { itemCount: items.length });

      return {
        items,
        sourceResult: {
          source: source.name,
          success: true,
          itemCount: items.length,
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 여러 스크래핑 소스를 병렬로 수집한다 (p-limit으로 동시 실행 수 제어).
   */
  async fetchAll(sources: NewsSource[]): Promise<{
    items: NewsItem[];
    sourceResults: SourceResult[];
    errors: AgentError[];
  }> {
    const pLimitModule = await import('p-limit');
    const limit = pLimitModule.default(CONCURRENCY_LIMIT);

    const allItems: NewsItem[] = [];
    const sourceResults: SourceResult[] = [];
    const errors: AgentError[] = [];

    const tasks = sources.map(source =>
      limit(async () => {
        try {
          const result = await withRetry(
            () => this.fetchFromSource(source),
            {
              maxRetries: 3,
              baseDelay: 1000,
              agentName: 'ScraperSubAgent',
              sourceName: source.name,
            }
          );
          allItems.push(...result.items);
          sourceResults.push(result.sourceResult);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`스크래핑 실패: ${source.name}`, { error: errorMessage });

          sourceResults.push({
            source: source.name,
            success: false,
            itemCount: 0,
            error: errorMessage,
          });

          errors.push({
            agent: 'ScraperSubAgent',
            message: `${source.name}: ${errorMessage}`,
            timestamp: new Date(),
          });
        }
      })
    );

    await Promise.allSettled(tasks);

    return { items: allItems, sourceResults, errors };
  }

  /**
   * Cheerio로 정적 HTML을 파싱한다.
   */
  private parseWithCheerio(html: string, source: NewsSource): NewsItem[] {
    const $ = cheerio.load(html);
    const selectors = source.selectors!;
    const items: NewsItem[] = [];

    $(selectors.articleList).each((_index, el) => {
      if (items.length >= MAX_ITEMS_PER_SOURCE) return false; // break

      const titleEl = $(el).find(selectors.title);
      const linkEl = $(el).find(selectors.link);
      const title = titleEl.text().trim();
      const rawLink = linkEl.attr('href') || '';

      if (!title || !rawLink) return; // continue

      const url = this.resolveUrl(source.url, rawLink);
      const date = selectors.date
        ? $(el).find(selectors.date).text().trim()
        : '';
      const content = selectors.content
        ? $(el).find(selectors.content).text().trim()
        : '';

      const publishedAt = date ? this.parseDate(date) : new Date();

      items.push({
        id: uuidv4(),
        title,
        url,
        source: source.name,
        publishedAt,
        content: content.length > 500 ? content.substring(0, 500) + '...' : content,
        language: source.language,
        category: source.category,
        collectedAt: new Date(),
        collectionMethod: 'scraping',
      });
    });

    return items;
  }

  /**
   * 상대 URL을 절대 URL로 변환한다.
   */
  private resolveUrl(baseUrl: string, path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    try {
      return new URL(path, baseUrl).href;
    } catch {
      // fallback: 직접 결합
      const base = baseUrl.replace(/\/+$/, '');
      const relativePath = path.startsWith('/') ? path : `/${path}`;
      return `${base}${relativePath}`;
    }
  }

  /**
   * 날짜 문자열을 Date 객체로 파싱한다.
   * 다양한 형식을 시도한다.
   */
  private parseDate(dateStr: string): Date {
    // 한국어 날짜 형식 시도: 2024.01.15, 2024-01-15, 2024/01/15
    const koreanDateMatch = dateStr.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (koreanDateMatch) {
      const [, year, month, day] = koreanDateMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }

    // 표준 Date 파싱 시도
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    // 파싱 실패 시 현재 시간 반환
    return new Date();
  }
}
