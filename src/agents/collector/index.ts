// ============================================================
// KDIS News Curator - Collector Agent
// 16개 뉴스 소스에서 병렬로 뉴스를 수집하는 메인 에이전트
// ============================================================

import type {
  NewsItem,
  NewsSource,
  CollectorResult,
  SourceResult,
  AgentError,
} from '../../shared/types.js';
import { RSSSubAgent } from './sub-agents/rss.js';
import { ScraperSubAgent } from './sub-agents/scraper.js';
import { APISubAgent } from './sub-agents/api.js';
import { newsSources } from './sources.config.js';
import { deduplicate } from '../../shared/deduplicator.js';
import { Logger } from '../../shared/logger.js';

const logger = new Logger('collector');

/** 전체 Collector 실행 타임아웃 (ms) */
const COLLECTOR_TIMEOUT = 120000; // 2분

export class CollectorAgent {
  private rssAgent: RSSSubAgent;
  private scraperAgent: ScraperSubAgent;
  private apiAgent: APISubAgent;

  constructor() {
    this.rssAgent = new RSSSubAgent();
    this.scraperAgent = new ScraperSubAgent();
    this.apiAgent = new APISubAgent();
  }

  /**
   * 모든 소스에서 뉴스를 병렬 수집한다.
   * @param sources 수집 대상 소스 목록 (기본값: newsSources)
   * @returns CollectorResult
   */
  async collect(sources?: NewsSource[]): Promise<CollectorResult> {
    const startTime = Date.now();
    const targetSources = (sources || newsSources).filter(s => s.enabled);

    logger.info(`수집 시작: ${targetSources.length}개 소스 (전체 ${(sources || newsSources).length}개 중 활성)`);

    // 타임아웃 설정
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Collector 전체 실행 타임아웃 (120초)')), COLLECTOR_TIMEOUT);
    });

    try {
      const grouped = this.groupSourcesByMethod(targetSources);

      logger.info('소스 그룹핑 완료', {
        rss: grouped.rss.length,
        scraping: grouped.scraping.length,
        api: grouped.api.length,
      });

      const result = await Promise.race([
        this.executeSubAgents(grouped),
        timeoutPromise,
      ]);

      // 중복 제거
      const deduped = deduplicate(result.items);

      const elapsed = Date.now() - startTime;
      logger.info(`수집 완료`, {
        totalCollected: deduped.items.length,
        duplicatesRemoved: deduped.duplicatesRemoved,
        sourceResults: result.sourceResults.length,
        errors: result.errors.length,
        elapsedMs: elapsed,
      });

      return {
        items: deduped.items,
        sourceResults: result.sourceResults,
        totalCollected: deduped.items.length,
        errors: result.errors,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('수집 실패', { error: errorMessage });

      return {
        items: [],
        sourceResults: [],
        totalCollected: 0,
        errors: [
          {
            agent: 'CollectorAgent',
            message: errorMessage,
            timestamp: new Date(),
          },
        ],
      };
    }
  }

  /**
   * 소스를 method별로 그룹핑하여 서브 에이전트에 분배한다.
   */
  private groupSourcesByMethod(sources: NewsSource[]): {
    rss: NewsSource[];
    scraping: NewsSource[];
    api: NewsSource[];
  } {
    const grouped: {
      rss: NewsSource[];
      scraping: NewsSource[];
      api: NewsSource[];
    } = {
      rss: [],
      scraping: [],
      api: [],
    };

    for (const source of sources) {
      switch (source.method) {
        case 'rss':
          grouped.rss.push(source);
          break;
        case 'scraping':
          grouped.scraping.push(source);
          break;
        case 'api':
          grouped.api.push(source);
          break;
        default:
          logger.warn(`알 수 없는 수집 method: ${source.method as string} (${source.name})`);
      }
    }

    return grouped;
  }

  /**
   * 서브 에이전트들을 Promise.allSettled로 병렬 실행한다.
   */
  private async executeSubAgents(grouped: {
    rss: NewsSource[];
    scraping: NewsSource[];
    api: NewsSource[];
  }): Promise<{
    items: NewsItem[];
    sourceResults: SourceResult[];
    errors: AgentError[];
  }> {
    const allItems: NewsItem[] = [];
    const allSourceResults: SourceResult[] = [];
    const allErrors: AgentError[] = [];

    const tasks: Promise<{
      items: NewsItem[];
      sourceResults: SourceResult[];
      errors: AgentError[];
    }>[] = [];

    if (grouped.rss.length > 0) {
      tasks.push(this.rssAgent.fetchAll(grouped.rss));
    }
    if (grouped.scraping.length > 0) {
      tasks.push(this.scraperAgent.fetchAll(grouped.scraping));
    }
    if (grouped.api.length > 0) {
      tasks.push(this.apiAgent.fetchAll(grouped.api));
    }

    const results = await Promise.allSettled(tasks);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value.items);
        allSourceResults.push(...result.value.sourceResults);
        allErrors.push(...result.value.errors);
      } else {
        const errorMessage = result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);

        logger.error('서브 에이전트 실행 실패', { error: errorMessage });

        allErrors.push({
          agent: 'CollectorAgent',
          message: `서브 에이전트 실행 실패: ${errorMessage}`,
          timestamp: new Date(),
        });
      }
    }

    return {
      items: allItems,
      sourceResults: allSourceResults,
      errors: allErrors,
    };
  }
}
