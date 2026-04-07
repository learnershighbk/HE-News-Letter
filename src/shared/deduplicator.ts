// ============================================================
// KDIS News Curator - Deduplicator
// URL 기반 + 제목 유사도 기반 중복 제거
// ============================================================

import type { NewsItem } from './types.js';
import { Logger } from './logger.js';

const logger = new Logger('deduplicator');

/**
 * 제목을 정규화하여 비교 가능한 형태로 변환한다.
 * - 소문자 변환
 * - 특수문자/공백 제거
 * - 연속 공백 제거
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // 유니코드 문자, 숫자, 공백만 남김
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * URL을 정규화하여 비교 가능한 형태로 변환한다.
 * - 프로토콜 제거
 * - trailing slash 제거
 * - query string 제거 (utm 파라미터 등)
 * - www. 제거
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // utm 파라미터 등 트래킹 파라미터 제거
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    trackingParams.forEach(param => parsed.searchParams.delete(param));

    const normalized = parsed.hostname.replace(/^www\./, '') +
      parsed.pathname.replace(/\/+$/, '') +
      (parsed.searchParams.toString() ? '?' + parsed.searchParams.toString() : '');

    return normalized.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

/**
 * 두 정규화된 제목의 유사도를 계산한다 (0~1).
 * 간단한 토큰 기반 Jaccard 유사도 사용.
 */
function titleSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(' ').filter(t => t.length > 1));
  const tokensB = new Set(b.split(' ').filter(t => t.length > 1));

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface DeduplicateResult {
  items: NewsItem[];
  duplicatesRemoved: number;
}

/**
 * NewsItem 배열에서 중복을 제거한다.
 * 1차: URL 기반 정확 매칭
 * 2차: 제목 유사도 기반 (threshold: 0.8)
 *
 * @param items 중복 제거 대상 뉴스 아이템 배열
 * @param similarityThreshold 제목 유사도 임계값 (기본 0.8)
 */
export function deduplicate(
  items: NewsItem[],
  similarityThreshold: number = 0.8
): DeduplicateResult {
  const originalCount = items.length;

  // 1단계: URL 기반 중복 제거
  const urlMap = new Map<string, NewsItem>();
  for (const item of items) {
    const normalizedUrl = normalizeUrl(item.url);
    if (!urlMap.has(normalizedUrl)) {
      urlMap.set(normalizedUrl, item);
    }
  }

  const urlDeduped = Array.from(urlMap.values());
  const urlDuplicates = originalCount - urlDeduped.length;
  if (urlDuplicates > 0) {
    logger.info(`URL 기반 중복 제거: ${urlDuplicates}건`);
  }

  // 2단계: 제목 유사도 기반 중복 제거
  const result: NewsItem[] = [];
  const normalizedTitles: string[] = [];

  for (const item of urlDeduped) {
    const normalized = normalizeTitle(item.title);
    let isDuplicate = false;

    for (const existingTitle of normalizedTitles) {
      if (titleSimilarity(normalized, existingTitle) >= similarityThreshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      result.push(item);
      normalizedTitles.push(normalized);
    }
  }

  const titleDuplicates = urlDeduped.length - result.length;
  if (titleDuplicates > 0) {
    logger.info(`제목 유사도 기반 중복 제거: ${titleDuplicates}건`);
  }

  const totalRemoved = originalCount - result.length;
  logger.info(`중복 제거 완료: ${originalCount}건 → ${result.length}건 (${totalRemoved}건 제거)`);

  return {
    items: result,
    duplicatesRemoved: totalRemoved,
  };
}
