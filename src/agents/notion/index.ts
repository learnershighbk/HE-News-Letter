// ============================================================
// Notion Agent - Notion DB에 큐레이팅된 뉴스 저장 및 파이프라인 로그 기록
// ============================================================

import { Client } from '@notionhq/client';
import { Logger } from '../../shared/logger.js';
import { withRetry } from '../../shared/retry.js';
import type {
  CuratedNewsItem,
  NotionResult,
  PipelineResult,
  AgentError,
} from '../../shared/types.js';
import { buildNewsPageProperties, buildLogPageProperties } from './schema.js';

// --- Constants ---

const RATE_LIMIT_DELAY_MS = 300;
const AGENT_NAME = 'notion';

// --- Helpers ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// --- NotionAgent ---

export class NotionAgent {
  private client: Client;
  private dbId: string;
  private logDbId: string;
  private logger: Logger;

  constructor() {
    const token = process.env.NOTION_TOKEN;
    if (!token) {
      throw new Error('NOTION_TOKEN environment variable is required');
    }

    this.dbId = process.env.NOTION_DB_ID ?? '';
    this.logDbId = process.env.NOTION_LOG_DB_ID ?? '';

    if (!this.dbId) {
      throw new Error('NOTION_DB_ID environment variable is required');
    }

    this.client = new Client({ auth: token });
    this.logger = new Logger('notion-agent');
  }

  /**
   * 큐레이팅된 뉴스 아이템들을 Notion DB에 저장
   */
  async store(items: CuratedNewsItem[]): Promise<NotionResult> {
    const createdPages: string[] = [];
    const errors: AgentError[] = [];

    this.logger.info(`Storing ${items.length} items to Notion`);

    for (const item of items) {
      try {
        // 중복 체크
        const duplicate = await this.isDuplicate(item.url);
        if (duplicate) {
          this.logger.info(`Skipping duplicate: ${item.url}`);
          continue;
        }

        // rate limit 대기
        await sleep(RATE_LIMIT_DELAY_MS);

        const pageId = await this.createNewsPage(item);
        createdPages.push(pageId);
        this.logger.info(`Created page: ${pageId} for "${item.title}"`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to store item: ${item.title}`, { error: message });
        errors.push({
          agent: AGENT_NAME,
          message: `Failed to store "${item.title}": ${message}`,
          timestamp: new Date(),
        });
      }
    }

    this.logger.info(`Stored ${createdPages.length}/${items.length} items`);

    return {
      createdPages,
      totalStored: createdPages.length,
      errors,
    };
  }

  /**
   * 단일 뉴스 아이템을 Notion 페이지로 생성
   */
  async createNewsPage(item: CuratedNewsItem): Promise<string> {
    const properties = buildNewsPageProperties(item);

    const response = await withRetry(
      async () => {
        return this.client.pages.create({
          parent: { database_id: this.dbId },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          properties: properties as any,
        });
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        agentName: AGENT_NAME,
        sourceName: `createPage:${item.title}`,
      },
    );

    return response.id;
  }

  /**
   * URL 기준으로 중복 여부 확인
   */
  async isDuplicate(url: string): Promise<boolean> {
    await sleep(RATE_LIMIT_DELAY_MS);

    const response = await withRetry(
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this.client as any).databases.query({
          database_id: this.dbId,
          filter: {
            property: 'URL',
            url: {
              equals: url,
            },
          },
          page_size: 1,
        });
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        agentName: AGENT_NAME,
        sourceName: `isDuplicate:${url}`,
      },
    );

    return response.results.length > 0;
  }

  /**
   * 페이지 상태 업데이트
   */
  async updateStatus(pageId: string, status: string): Promise<void> {
    await sleep(RATE_LIMIT_DELAY_MS);

    await withRetry(
      async () => {
        return this.client.pages.update({
          page_id: pageId,
          properties: {
            Status: {
              select: { name: status },
            },
          } as any,
        });
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        agentName: AGENT_NAME,
        sourceName: `updateStatus:${pageId}`,
      },
    );

    this.logger.info(`Updated page ${pageId} status to "${status}"`);
  }

  /**
   * 파이프라인 실행 결과를 로그 DB에 기록
   */
  async logPipelineRun(result: PipelineResult): Promise<void> {
    if (!this.logDbId) {
      this.logger.warn('NOTION_LOG_DB_ID not set, skipping pipeline log');
      return;
    }

    await sleep(RATE_LIMIT_DELAY_MS);

    const properties = buildLogPageProperties(result);

    await withRetry(
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this.client as any).pages.create({
          parent: { database_id: this.logDbId },
          properties: properties as any,
        });
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        agentName: AGENT_NAME,
        sourceName: 'logPipelineRun',
      },
    );

    this.logger.info(`Pipeline run ${result.runId} logged to Notion`);
  }

  /**
   * 다음 이슈 번호 조회 (로그 DB의 총 페이지 수 + 1)
   */
  async getNextIssueNumber(): Promise<number> {
    await sleep(RATE_LIMIT_DELAY_MS);

    try {
      const response = await withRetry(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this.client as any).databases.query({
            database_id: this.logDbId || this.dbId,
            sorts: [
              {
                timestamp: 'created_time',
                direction: 'descending',
              },
            ],
            page_size: 1,
          });
        },
        {
          maxRetries: 3,
          baseDelay: 1000,
          agentName: AGENT_NAME,
          sourceName: 'getNextIssueNumber',
        },
      );

      // 기존 로그 수를 기반으로 다음 이슈 번호 산정
      // has_more가 true이면 더 많은 결과가 있으므로 전체 개수를 정확히 알기 어렵다.
      // 간단하게: 가장 최근 로그의 Title에서 번호를 파싱하거나, 전체 수 카운트
      // 여기서는 전체를 쿼리하지 않고 페이지 수를 순차 카운트하는 대신
      // 간략화: 전체 쿼리 결과 수 기반
      let totalPages = 0;
      let hasMore = true;
      let startCursor: string | undefined;

      while (hasMore) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryResponse = await (this.client as any).databases.query({
          database_id: this.logDbId || this.dbId,
          page_size: 100,
          start_cursor: startCursor,
        });
        totalPages += queryResponse.results.length;
        hasMore = queryResponse.has_more;
        startCursor = queryResponse.next_cursor ?? undefined;

        await sleep(RATE_LIMIT_DELAY_MS);
      }

      return totalPages + 1;
    } catch (error) {
      this.logger.warn('Failed to get issue number, defaulting to 1', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 1;
    }
  }
}
