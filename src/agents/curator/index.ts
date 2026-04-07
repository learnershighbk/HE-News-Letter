// ============================================================
// Curator Agent - Main Class
// Claude API를 사용한 뉴스 큐레이션
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import type {
  NewsItem,
  CuratedNewsItem,
  CuratorResult,
  CurationCriteria,
  AgentError,
  NewsCategory,
} from '../../shared/types.js';
import { withRetry } from '../../shared/retry.js';
import { buildSystemPrompt, buildUserPrompt } from './prompts.js';
import {
  DEFAULT_CRITERIA,
  filterByRelevance,
  assignPriority,
  limitItems,
} from './scorer.js';

/** Claude API 응답에서 파싱된 단일 아이템 */
interface CuratedItemResponse {
  id: string;
  relevanceScore: number;
  categories: string[];
  summaryKo: string;
  summaryEn: string;
  kdiInsight: string;
  tags: string[];
}

/** 유효한 카테고리 목록 */
const VALID_CATEGORIES: NewsCategory[] = [
  '교육혁신 & 테크',
  '정책 & 거버넌스',
  '교수법 & 교원개발',
  '국제화 & 랭킹',
  'AI 윤리 & 가이드라인',
  '학생 성공 & 취업',
];

/**
 * 배열을 지정된 크기의 청크로 분할
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * 지정된 ms만큼 대기
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CuratorAgent {
  private client: Anthropic;
  private model: string;
  private criteria: CurationCriteria;

  constructor(options?: {
    apiKey?: string;
    model?: string;
    criteria?: Partial<CurationCriteria>;
  }) {
    this.client = new Anthropic({
      apiKey: options?.apiKey ?? process.env['ANTHROPIC_API_KEY'],
    });
    this.model = options?.model ?? 'claude-sonnet-4-20250514';
    this.criteria = { ...DEFAULT_CRITERIA, ...options?.criteria };
  }

  /**
   * 뉴스 아이템 전체 큐레이션 수행
   */
  async curate(items: NewsItem[]): Promise<CuratorResult> {
    const errors: AgentError[] = [];
    const allCurated: CuratedNewsItem[] = [];

    if (items.length === 0) {
      return {
        items: [],
        totalProcessed: 0,
        totalPassed: 0,
        totalFiltered: 0,
        errors: [],
      };
    }

    // 5개씩 배치 처리
    const batches = chunk(items, 5);
    console.log(
      `[Curator] ${items.length}개 뉴스를 ${batches.length}개 배치로 처리`,
    );

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      console.log(
        `[Curator] 배치 ${i + 1}/${batches.length} 처리 중 (${batch.length}개)`,
      );

      try {
        const curatedBatch = await this.curateBatch(batch);
        allCurated.push(...curatedBatch);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(`[Curator] 배치 ${i + 1} 실패: ${message}`);
        errors.push({
          agent: 'curator',
          message: `배치 ${i + 1} 큐레이션 실패: ${message}`,
          timestamp: new Date(),
          retryCount: 3,
        });
      }

      // 배치 간 1초 대기 (마지막 배치 제외)
      if (i < batches.length - 1) {
        await delay(1000);
      }
    }

    // 점수 기반 필터링
    const filtered = filterByRelevance(allCurated, this.criteria.minRelevanceScore);

    // 우선순위 배정
    const prioritized = assignPriority(filtered, this.criteria);

    // 최대 아이템 수 제한
    const limited = limitItems(prioritized, this.criteria.maxItemsPerNewsletter);

    console.log(
      `[Curator] 완료: ${items.length}개 처리 → ${allCurated.length}개 큐레이션 → ${limited.length}개 선정`,
    );

    return {
      items: limited,
      totalProcessed: items.length,
      totalPassed: limited.length,
      totalFiltered: allCurated.length - limited.length,
      errors,
    };
  }

  /**
   * 단일 배치 큐레이션 (Claude API 호출)
   */
  private async curateBatch(batch: NewsItem[]): Promise<CuratedNewsItem[]> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(batch);

    const response = await withRetry(
      async () => {
        const result = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          temperature: 0.3,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const textBlock = result.content.find((block) => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw new Error('Claude API 응답에 텍스트 블록이 없습니다');
        }
        return textBlock.text;
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        agentName: 'curator',
        sourceName: 'claude-api',
      },
    );

    // JSON 파싱
    const parsed = this.parseJsonResponse(response);

    // 원본과 매칭하여 CuratedNewsItem 생성
    return this.mergeBatchResults(batch, parsed);
  }

  /**
   * Claude 응답에서 JSON 배열 추출 및 파싱
   */
  private parseJsonResponse(text: string): CuratedItemResponse[] {
    // ```json ... ``` 블록 추출 시도
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
    const jsonStr = jsonBlockMatch ? jsonBlockMatch[1]!.trim() : text.trim();

    try {
      const parsed: unknown = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) {
        throw new Error('응답이 JSON 배열이 아닙니다');
      }

      return parsed.map((item: unknown) => this.validateCuratedItem(item));
    } catch (error) {
      // 순수 JSON 배열 직접 추출 시도
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const parsed: unknown = JSON.parse(arrayMatch[0]);
          if (Array.isArray(parsed)) {
            return parsed.map((item: unknown) =>
              this.validateCuratedItem(item),
            );
          }
        } catch {
          // 최종 실패
        }
      }

      throw new Error(
        `JSON 파싱 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 파싱된 아이템 검증
   */
  private validateCuratedItem(raw: unknown): CuratedItemResponse {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('큐레이션 아이템이 객체가 아닙니다');
    }

    const item = raw as Record<string, unknown>;

    if (typeof item['id'] !== 'string') {
      throw new Error('id 필드가 없거나 문자열이 아닙니다');
    }
    if (typeof item['relevanceScore'] !== 'number') {
      throw new Error('relevanceScore 필드가 없거나 숫자가 아닙니다');
    }
    if (!Array.isArray(item['categories'])) {
      throw new Error('categories 필드가 없거나 배열이 아닙니다');
    }
    if (typeof item['summaryKo'] !== 'string') {
      throw new Error('summaryKo 필드가 없거나 문자열이 아닙니다');
    }
    if (typeof item['summaryEn'] !== 'string') {
      throw new Error('summaryEn 필드가 없거나 문자열이 아닙니다');
    }
    if (typeof item['kdiInsight'] !== 'string') {
      throw new Error('kdiInsight 필드가 없거나 문자열이 아닙니다');
    }
    if (!Array.isArray(item['tags'])) {
      throw new Error('tags 필드가 없거나 배열이 아닙니다');
    }

    // 카테고리 검증: 유효한 카테고리만 포함
    const validatedCategories = (item['categories'] as string[]).filter(
      (cat): cat is NewsCategory =>
        VALID_CATEGORIES.includes(cat as NewsCategory),
    );

    if (validatedCategories.length === 0) {
      console.warn(
        `[Curator] 아이템 ${item['id']}: 유효한 카테고리 없음, 원본 값: ${JSON.stringify(item['categories'])}`,
      );
    }

    return {
      id: item['id'] as string,
      relevanceScore: Math.max(0, Math.min(100, item['relevanceScore'] as number)),
      categories: validatedCategories,
      summaryKo: item['summaryKo'] as string,
      summaryEn: item['summaryEn'] as string,
      kdiInsight: item['kdiInsight'] as string,
      tags: (item['tags'] as unknown[]).filter(
        (t): t is string => typeof t === 'string',
      ),
    };
  }

  /**
   * 원본 NewsItem과 큐레이션 결과를 매칭하여 CuratedNewsItem 생성
   */
  private mergeBatchResults(
    originals: NewsItem[],
    curated: CuratedItemResponse[],
  ): CuratedNewsItem[] {
    const originalMap = new Map<string, NewsItem>();
    for (const item of originals) {
      originalMap.set(item.id, item);
    }

    const results: CuratedNewsItem[] = [];

    for (const cur of curated) {
      const original = originalMap.get(cur.id);
      if (!original) {
        console.warn(
          `[Curator] 원본을 찾을 수 없는 아이템 건너뜀: ${cur.id}`,
        );
        continue;
      }

      results.push({
        ...original,
        relevanceScore: cur.relevanceScore,
        categories: cur.categories as NewsCategory[],
        summaryKo: cur.summaryKo,
        summaryEn: cur.summaryEn,
        kdiInsight: cur.kdiInsight,
        priority: this.scoreToPriority(cur.relevanceScore),
        tags: cur.tags,
      });
    }

    return results;
  }

  /**
   * 점수를 초기 우선순위로 변환 (assignPriority에서 재조정됨)
   */
  private scoreToPriority(score: number): 'must-read' | 'recommended' | 'reference' {
    if (score >= 90) return 'must-read';
    if (score >= 70) return 'recommended';
    return 'reference';
  }
}
