// ============================================================
// KDIS News Curator - RSS Sub-Agent
// RSS/Atom 피드에서 뉴스를 수집하는 서브 에이전트
// ============================================================

import Parser from 'rss-parser';
import { v4 as uuidv4 } from 'uuid';
import type { NewsItem, NewsSource, SourceResult, AgentError } from '../../../shared/types.js';
import { withRetry } from '../../../shared/retry.js';
import { Logger } from '../../../shared/logger.js';

const logger = new Logger('collector:rss');

/** 최근 N일 이내의 기사만 수집 */
const MAX_AGE_DAYS = 7;

/** content 최대 길이 */
const MAX_CONTENT_LENGTH = 500;

/** p-limit 동시 실행 수 */
const CONCURRENCY_LIMIT = 5;

export class RSSSubAgent {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'KDIS-News-Curator/1.0',
      },
    });
  }

  /**
   * 단일 RSS 소스에서 뉴스를 수집한다.
   */
  async fetchFromSource(source: NewsSource): Promise<{
    items: NewsItem[];
    sourceResult: SourceResult;
  }> {
    if (!source.rssUrl) {
      return {
        items: [],
        sourceResult: {
          source: source.name,
          success: false,
          itemCount: 0,
          error: 'rssUrl이 설정되지 않았습니다.',
        },
      };
    }

    logger.info(`RSS 수집 시작: ${source.name}`, { url: source.rssUrl });

    const feed = await this.parser.parseURL(source.rssUrl);
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    const items: NewsItem[] = [];
    for (const feedItem of feed.items) {
      const newsItem = this.toNewsItem(feedItem, source);
      if (newsItem.publishedAt >= cutoffDate) {
        items.push(newsItem);
      }
    }

    logger.info(`RSS 수집 완료: ${source.name}`, {
      total: feed.items.length,
      filtered: items.length,
    });

    return {
      items,
      sourceResult: {
        source: source.name,
        success: true,
        itemCount: items.length,
      },
    };
  }

  /**
   * 여러 RSS 소스를 병렬로 수집한다 (p-limit으로 동시 실행 수 제어).
   */
  async fetchAll(sources: NewsSource[]): Promise<{
    items: NewsItem[];
    sourceResults: SourceResult[];
    errors: AgentError[];
  }> {
    // p-limit은 ESM 전용이므로 dynamic import 사용
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
              agentName: 'RSSSubAgent',
              sourceName: source.name,
            }
          );
          allItems.push(...result.items);
          sourceResults.push(result.sourceResult);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`RSS 수집 실패: ${source.name}`, { error: errorMessage });

          sourceResults.push({
            source: source.name,
            success: false,
            itemCount: 0,
            error: errorMessage,
          });

          errors.push({
            agent: 'RSSSubAgent',
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
   * RSS 피드 아이템을 NewsItem 타입으로 변환한다.
   */
  private toNewsItem(feedItem: Parser.Item, source: NewsSource): NewsItem {
    const rawContent = feedItem.contentSnippet || feedItem.content || '';
    const content = rawContent.length > MAX_CONTENT_LENGTH
      ? rawContent.substring(0, MAX_CONTENT_LENGTH) + '...'
      : rawContent;

    const publishedAt = feedItem.pubDate
      ? new Date(feedItem.pubDate)
      : new Date();

    return {
      id: uuidv4(),
      title: (feedItem.title || '').trim(),
      url: feedItem.link || '',
      source: source.name,
      publishedAt,
      content: content.trim(),
      language: source.language,
      category: source.category,
      collectedAt: new Date(),
      collectionMethod: 'rss',
    };
  }
}
