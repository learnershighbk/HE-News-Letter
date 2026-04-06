// ============================================================
// KDIS News Curator - Shared Type Definitions
// 모든 에이전트 간 통신에 사용되는 타입 인터페이스
// ============================================================

// --- News Item Types ---

export type Language = 'en' | 'ko';

export type Priority = 'must-read' | 'recommended' | 'reference';

export type NewsCategory =
  | '교육혁신 & 테크'
  | '정책 & 거버넌스'
  | '교수법 & 교원개발'
  | '국제화 & 랭킹'
  | 'AI 윤리 & 가이드라인'
  | '학생 성공 & 취업';

export type CollectionMethod = 'rss' | 'scraping' | 'api';

export type PipelineStatus =
  | 'collected'
  | 'deduplicated'
  | 'curated'
  | 'stored'
  | 'sent'
  | 'failed';

/** Collector Agent가 수집한 원시 뉴스 아이템 */
export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: Date;
  content: string;
  language: Language;
  category: string;
  collectedAt: Date;
  collectionMethod: CollectionMethod;
}

/** Curator Agent가 큐레이션한 뉴스 아이템 */
export interface CuratedNewsItem extends NewsItem {
  relevanceScore: number;
  categories: NewsCategory[];
  summaryKo: string;
  summaryEn: string;
  kdiInsight: string;
  priority: Priority;
  tags: string[];
}

// --- Source Configuration ---

export interface NewsSource {
  name: string;
  url: string;
  method: CollectionMethod;
  language: Language;
  category: string;
  /** RSS 피드 URL (method가 'rss'인 경우) */
  rssUrl?: string;
  /** 스크래핑 셀렉터 (method가 'scraping'인 경우) */
  selectors?: ScrapingSelectors;
  enabled: boolean;
}

export interface ScrapingSelectors {
  articleList: string;
  title: string;
  link: string;
  date?: string;
  content?: string;
}

// --- Agent Results ---

export interface CollectorResult {
  items: NewsItem[];
  sourceResults: SourceResult[];
  totalCollected: number;
  errors: AgentError[];
}

export interface SourceResult {
  source: string;
  success: boolean;
  itemCount: number;
  error?: string;
}

export interface CuratorResult {
  items: CuratedNewsItem[];
  totalProcessed: number;
  totalPassed: number;
  totalFiltered: number;
  errors: AgentError[];
}

export interface NotionResult {
  createdPages: string[];
  totalStored: number;
  errors: AgentError[];
}

export interface MailerResult {
  sent: boolean;
  recipientCount: number;
  issueNumber: number;
  subject: string;
  errors: AgentError[];
}

// --- Pipeline ---

export interface PipelineResult {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  status: 'success' | 'partial' | 'failed';
  collector: CollectorResult;
  curator: CuratorResult;
  notion: NotionResult;
  mailer: MailerResult;
  errors: AgentError[];
}

export interface PipelineConfig {
  sources: NewsSource[];
  recipients: Recipient[];
  curationCriteria: CurationCriteria;
  notionDbId: string;
  notionLogDbId: string;
}

export interface CurationCriteria {
  minRelevanceScore: number;
  maxItemsPerNewsletter: number;
  mustReadCount: number;
  recommendedCount: number;
}

export interface Recipient {
  email: string;
  name: string;
}

// --- Error Handling ---

export interface AgentError {
  agent: string;
  message: string;
  code?: string;
  timestamp: Date;
  retryCount?: number;
}

// --- Logging ---

export interface PipelineLog {
  runId: string;
  timestamp: Date;
  status: PipelineStatus;
  details: Record<string, unknown>;
}
