// ============================================================
// Notion Agent - Property Schema Mapping
// CuratedNewsItem / PipelineResult → Notion 프로퍼티 객체 변환
// ============================================================

import type { CuratedNewsItem, PipelineResult, Priority } from '../../shared/types.js';

// --- Constants ---

const RICH_TEXT_MAX_LENGTH = 2000;

const PRIORITY_KO: Record<Priority, string> = {
  'must-read': '필독',
  'recommended': '추천',
  'reference': '참고',
};

// --- Helpers ---

function truncate(text: string, maxLength: number = RICH_TEXT_MAX_LENGTH): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

function toISODate(date: Date | string): string {
  if (date instanceof Date) {
    return date.toISOString();
  }
  return new Date(date).toISOString();
}

function richText(content: string): Array<{ type: 'text'; text: { content: string } }> {
  return [
    {
      type: 'text' as const,
      text: { content: truncate(content) },
    },
  ];
}

// --- News Page Properties ---

export interface NotionNewsProperties {
  Title: { title: Array<{ type: 'text'; text: { content: string } }> };
  URL: { url: string };
  Source: { rich_text: Array<{ type: 'text'; text: { content: string } }> };
  'Published Date': { date: { start: string } };
  Priority: { select: { name: string } };
  Categories: { multi_select: Array<{ name: string }> };
  'Summary (KO)': { rich_text: Array<{ type: 'text'; text: { content: string } }> };
  'Summary (EN)': { rich_text: Array<{ type: 'text'; text: { content: string } }> };
  'KDI Insight': { rich_text: Array<{ type: 'text'; text: { content: string } }> };
  'Relevance Score': { number: number };
  Tags: { multi_select: Array<{ name: string }> };
  Language: { select: { name: string } };
  Status: { select: { name: string } };
}

export function buildNewsPageProperties(item: CuratedNewsItem): NotionNewsProperties {
  return {
    Title: {
      title: richText(item.title),
    },
    URL: {
      url: item.url,
    },
    Source: {
      rich_text: richText(item.source),
    },
    'Published Date': {
      date: { start: toISODate(item.publishedAt) },
    },
    Priority: {
      select: { name: PRIORITY_KO[item.priority] },
    },
    Categories: {
      multi_select: item.categories.map((cat) => ({ name: cat })),
    },
    'Summary (KO)': {
      rich_text: richText(item.summaryKo),
    },
    'Summary (EN)': {
      rich_text: richText(item.summaryEn),
    },
    'KDI Insight': {
      rich_text: richText(item.kdiInsight),
    },
    'Relevance Score': {
      number: item.relevanceScore,
    },
    Tags: {
      multi_select: item.tags.map((tag) => ({ name: tag })),
    },
    Language: {
      select: { name: item.language === 'ko' ? '한국어' : 'English' },
    },
    Status: {
      select: { name: 'stored' },
    },
  };
}

// --- Log Page Properties ---

export interface NotionLogProperties {
  Title: { title: Array<{ type: 'text'; text: { content: string } }> };
  'Run ID': { rich_text: Array<{ type: 'text'; text: { content: string } }> };
  Status: { select: { name: string } };
  'Started At': { date: { start: string } };
  'Completed At': { date: { start: string } };
  'Total Collected': { number: number };
  'Total Curated': { number: number };
  'Total Stored': { number: number };
  'Email Sent': { checkbox: boolean };
  Errors: { rich_text: Array<{ type: 'text'; text: { content: string } }> };
}

export function buildLogPageProperties(result: PipelineResult): NotionLogProperties {
  const errorSummary = result.errors.length > 0
    ? result.errors.map((e) => `[${e.agent}] ${e.message}`).join('\n')
    : 'No errors';

  return {
    Title: {
      title: richText(
        `Pipeline Run ${result.runId} - ${result.status.toUpperCase()}`,
      ),
    },
    'Run ID': {
      rich_text: richText(result.runId),
    },
    Status: {
      select: { name: result.status },
    },
    'Started At': {
      date: { start: toISODate(result.startedAt) },
    },
    'Completed At': {
      date: { start: toISODate(result.completedAt) },
    },
    'Total Collected': {
      number: result.collector.totalCollected,
    },
    'Total Curated': {
      number: result.curator.totalPassed,
    },
    'Total Stored': {
      number: result.notion.totalStored,
    },
    'Email Sent': {
      checkbox: result.mailer.sent,
    },
    Errors: {
      rich_text: richText(truncate(errorSummary)),
    },
  };
}
