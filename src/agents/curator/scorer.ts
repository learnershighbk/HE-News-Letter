// ============================================================
// Curator Agent - Scorer & Filter
// 점수 기반 필터링 및 우선순위 배정
// ============================================================

import type {
  CuratedNewsItem,
  CurationCriteria,
  Priority,
} from '../../shared/types.js';

/** 기본 큐레이션 기준 */
export const DEFAULT_CRITERIA: CurationCriteria = {
  minRelevanceScore: 60,
  maxItemsPerNewsletter: 20,
  mustReadCount: 3,
  recommendedCount: 7,
};

/**
 * 관련성 점수 기반 필터링 - minScore 이상만 통과
 */
export function filterByRelevance(
  items: CuratedNewsItem[],
  minScore: number = DEFAULT_CRITERIA.minRelevanceScore,
): CuratedNewsItem[] {
  return items.filter((item) => item.relevanceScore >= minScore);
}

/**
 * 점수 기반 우선순위 배정
 * - 90+: must-read
 * - 70-89: recommended
 * - 60-69: reference
 */
export function assignPriority(
  items: CuratedNewsItem[],
  criteria: CurationCriteria = DEFAULT_CRITERIA,
): CuratedNewsItem[] {
  // 점수 내림차순 정렬
  const sorted = [...items].sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  );

  let mustReadAssigned = 0;
  let recommendedAssigned = 0;

  return sorted.map((item) => {
    let priority: Priority;

    if (item.relevanceScore >= 90 && mustReadAssigned < criteria.mustReadCount) {
      priority = 'must-read';
      mustReadAssigned++;
    } else if (
      item.relevanceScore >= 70 &&
      recommendedAssigned < criteria.recommendedCount
    ) {
      priority = 'recommended';
      recommendedAssigned++;
    } else {
      priority = 'reference';
    }

    return { ...item, priority };
  });
}

/**
 * 최대 아이템 수 제한 (점수 높은 순)
 */
export function limitItems(
  items: CuratedNewsItem[],
  maxItems: number = DEFAULT_CRITERIA.maxItemsPerNewsletter,
): CuratedNewsItem[] {
  const sorted = [...items].sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  );
  return sorted.slice(0, maxItems);
}
