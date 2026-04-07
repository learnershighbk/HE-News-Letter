// ============================================================
// KDIS News Curator - API Sub-Agent
// API 기반 뉴스 수집 서브 에이전트
// rssUrl이 있으면 RSS 방식으로 fallback
// ============================================================

import type { NewsItem, NewsSource, SourceResult, AgentError } from '../../../shared/types.js';
import { RSSSubAgent } from './rss.js';
import { Logger } from '../../../shared/logger.js';

const logger = new Logger('collector:api');

export class APISubAgent {
  private rssAgent: RSSSubAgent;

  constructor() {
    this.rssAgent = new RSSSubAgent();
  }

  /**
   * API 소스에서 뉴스를 수집한다.
   * 현재는 rssUrl이 있으면 RSS fallback, 없으면 빈 결과를 반환한다.
   * 향후 전용 API 연동을 추가할 수 있도록 확장 가능하게 설계.
   */
  async fetchFromSource(source: NewsSource): Promise<{
    items: NewsItem[];
    sourceResult: SourceResult;
  }> {
    // rssUrl이 있으면 RSS 방식으로 fallback
    if (source.rssUrl) {
      logger.info(`API 소스 "${source.name}"에 rssUrl이 있어 RSS fallback 사용`);
      const result = await this.rssAgent.fetchFromSource(source);

      // collectionMethod를 'api'로 재설정
      const items = result.items.map(item => ({
        ...item,
        collectionMethod: 'api' as const,
      }));

      return {
        items,
        sourceResult: result.sourceResult,
      };
    }

    // 향후 전용 API endpoint 연동을 위한 스텁
    logger.warn(`API 소스 "${source.name}"에 대한 전용 API 연동이 아직 구현되지 않았습니다.`);

    return {
      items: [],
      sourceResult: {
        source: source.name,
        success: false,
        itemCount: 0,
        error: '전용 API 연동이 아직 구현되지 않았습니다. rssUrl을 설정하여 RSS fallback을 사용하세요.',
      },
    };
  }

  /**
   * 여러 API 소스를 병렬로 수집한다.
   */
  async fetchAll(sources: NewsSource[]): Promise<{
    items: NewsItem[];
    sourceResults: SourceResult[];
    errors: AgentError[];
  }> {
    const allItems: NewsItem[] = [];
    const sourceResults: SourceResult[] = [];
    const errors: AgentError[] = [];

    const results = await Promise.allSettled(
      sources.map(source => this.fetchFromSource(source))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const source = sources[i];

      if (result.status === 'fulfilled') {
        allItems.push(...result.value.items);
        sourceResults.push(result.value.sourceResult);
      } else {
        const errorMessage = result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);

        logger.error(`API 수집 실패: ${source.name}`, { error: errorMessage });

        sourceResults.push({
          source: source.name,
          success: false,
          itemCount: 0,
          error: errorMessage,
        });

        errors.push({
          agent: 'APISubAgent',
          message: `${source.name}: ${errorMessage}`,
          timestamp: new Date(),
        });
      }
    }

    return { items: allItems, sourceResults, errors };
  }

  /**
   * 향후 전용 API 연동을 위한 스텁 메서드.
   * @param _endpoint API endpoint URL
   * @param _apiKey API 인증키
   */
  async fetchFromApi(
    _endpoint: string,
    _apiKey?: string
  ): Promise<NewsItem[]> {
    // TODO: 전용 API 연동 구현
    throw new Error('fetchFromApi is not yet implemented');
  }
}
