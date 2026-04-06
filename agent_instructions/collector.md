# Collector Agent - 뉴스 수집 에이전트 구현 명세

## 1. 에이전트 개요

Collector Agent는 16개 글로벌 고등교육/AI 뉴스 소스에서 뉴스를 자동 수집하는 에이전트이다. 3개의 서브 에이전트(RSS, Scraper, API)가 소스 유형별로 **병렬 실행**되며, 수집 결과를 `NewsItem[]` 타입으로 반환한다.

**담당 파일 구조:**
```
src/agents/collector/
  ├── index.ts              # CollectorAgent 메인 클래스
  ├── sources.config.ts     # 16개 소스 설정
  └── sub-agents/
      ├── rss.ts            # RSSSubAgent
      ├── scraper.ts        # ScraperSubAgent
      └── api.ts            # APISubAgent
```

---

## 2. Dependencies (npm packages)

```json
{
  "rss-parser": "^3.13.0",
  "cheerio": "^1.0.0",
  "puppeteer": "^23.0.0",
  "uuid": "^10.0.0",
  "p-limit": "^6.0.0"
}
```

- `rss-parser`: RSS/Atom 피드 파싱
- `cheerio`: 정적 HTML 스크래핑 (jQuery-like)
- `puppeteer`: 동적 페이지 렌더링 (SPA, JS-rendered 콘텐츠)
- `uuid`: NewsItem ID 생성
- `p-limit`: 동시 실행 수 제어 (rate limiting)

**devDependencies:**
```json
{
  "@types/uuid": "^10.0.0"
}
```

---

## 3. Input/Output 타입

`src/shared/types.ts`에서 import하여 사용한다:

```typescript
// Input
import { NewsSource, PipelineConfig } from '../shared/types';

// Output
import { NewsItem, CollectorResult, SourceResult, AgentError } from '../shared/types';
```

### Input
- `sources: NewsSource[]` - 수집 대상 소스 목록 (sources.config.ts에서 로드)

### Output
- `CollectorResult` - 수집 결과
  - `items: NewsItem[]` - 수집된 뉴스 아이템 배열
  - `sourceResults: SourceResult[]` - 소스별 수집 결과
  - `totalCollected: number` - 총 수집 건수
  - `errors: AgentError[]` - 발생한 에러 목록

---

## 4. 소스 설정 (sources.config.ts)

`src/agents/collector/sources.config.ts` 파일에 16개 소스를 `NewsSource[]` 타입으로 정의한다.

```typescript
import { NewsSource } from '../../shared/types';

export const NEWS_SOURCES: NewsSource[] = [
  // === 고등교육 정책 (RSS) ===
  {
    name: 'Times Higher Education',
    url: 'https://www.timeshighereducation.com',
    method: 'rss',
    language: 'en',
    category: '고등교육 정책',
    rssUrl: 'https://www.timeshighereducation.com/rss',
    enabled: true,
  },
  {
    name: 'Inside Higher Ed',
    url: 'https://www.insidehighered.com',
    method: 'rss',
    language: 'en',
    category: '고등교육 정책',
    rssUrl: 'https://www.insidehighered.com/rss/feed',
    enabled: true,
  },
  {
    name: 'Chronicle of Higher Education',
    url: 'https://www.chronicle.com',
    method: 'rss',
    language: 'en',
    category: '고등교육 정책',
    rssUrl: 'https://www.chronicle.com/feed',
    enabled: true,
  },
  {
    name: 'University World News',
    url: 'https://www.universityworldnews.com',
    method: 'rss',
    language: 'en',
    category: '고등교육 정책',
    rssUrl: 'https://www.universityworldnews.com/rss.php',
    enabled: true,
  },

  // === AI in Education ===
  {
    name: 'EDUCAUSE Review',
    url: 'https://er.educause.edu',
    method: 'rss',
    language: 'en',
    category: 'AI in Education',
    rssUrl: 'https://er.educause.edu/rss',
    enabled: true,
  },
  {
    name: 'MIT OpenCourseWare Blog',
    url: 'https://ocw.mit.edu',
    method: 'rss',
    language: 'en',
    category: 'AI in Education',
    rssUrl: 'https://ocw.mit.edu/rss/new',
    enabled: true,
  },
  {
    name: 'Stanford HAI',
    url: 'https://hai.stanford.edu',
    method: 'scraping',
    language: 'en',
    category: 'AI in Education',
    selectors: {
      articleList: '.news-item, .blog-post, article',
      title: 'h2 a, h3 a',
      link: 'h2 a, h3 a',
      date: '.date, time',
      content: '.summary, .excerpt, p',
    },
    enabled: true,
  },

  // === 한국 고등교육 ===
  {
    name: '한국대학교육협의회',
    url: 'https://www.kcue.or.kr',
    method: 'scraping',
    language: 'ko',
    category: '한국 고등교육',
    selectors: {
      articleList: '.board-list tr, .bbs-list li',
      title: 'a',
      link: 'a',
      date: '.date, td:last-child',
    },
    enabled: true,
  },
  {
    name: '교육부 보도자료',
    url: 'https://www.moe.go.kr',
    method: 'scraping',
    language: 'ko',
    category: '한국 고등교육',
    selectors: {
      articleList: '.board_list tbody tr',
      title: '.board_left a, td.subject a',
      link: '.board_left a, td.subject a',
      date: '.board_date, td.date',
    },
    enabled: true,
  },
  {
    name: '대학지성IN',
    url: 'https://www.unipress.co.kr',
    method: 'rss',
    language: 'ko',
    category: '한국 고등교육',
    rssUrl: 'https://www.unipress.co.kr/rss/allArticle.xml',
    enabled: true,
  },
  {
    name: '한국대학신문',
    url: 'https://news.unn.net',
    method: 'rss',
    language: 'ko',
    category: '한국 고등교육',
    rssUrl: 'https://news.unn.net/rss/allArticle.xml',
    enabled: true,
  },

  // === AI 업계 동향 (RSS) ===
  {
    name: 'Anthropic Blog',
    url: 'https://www.anthropic.com',
    method: 'rss',
    language: 'en',
    category: 'AI 업계 동향',
    rssUrl: 'https://www.anthropic.com/rss.xml',
    enabled: true,
  },
  {
    name: 'OpenAI Blog',
    url: 'https://openai.com',
    method: 'rss',
    language: 'en',
    category: 'AI 업계 동향',
    rssUrl: 'https://openai.com/blog/rss.xml',
    enabled: true,
  },
  {
    name: 'Google AI Blog',
    url: 'https://blog.google/technology/ai/',
    method: 'rss',
    language: 'en',
    category: 'AI 업계 동향',
    rssUrl: 'https://blog.google/technology/ai/rss/',
    enabled: true,
  },

  // === 정책/거버넌스 ===
  {
    name: 'OECD Education GPS',
    url: 'https://gpseducation.oecd.org',
    method: 'rss',
    language: 'en',
    category: '정책/거버넌스',
    rssUrl: 'https://gpseducation.oecd.org/rss',
    enabled: true,
  },
  {
    name: 'World Bank EdTech',
    url: 'https://blogs.worldbank.org/en/topic/edutech',
    method: 'rss',
    language: 'en',
    category: '정책/거버넌스',
    rssUrl: 'https://blogs.worldbank.org/en/topic/edutech/rss.xml',
    enabled: true,
  },
];
```

> **중요**: RSS URL은 실제 운영 시 유효성을 확인하고 업데이트해야 한다. 스크래핑 셀렉터도 대상 사이트의 구조 변경 시 조정이 필요하다.

---

## 5. Core Functions 구현

### 5.1 CollectorAgent 메인 클래스 (`index.ts`)

```typescript
import { NewsItem, NewsSource, CollectorResult, SourceResult, AgentError } from '../../shared/types';
import { RSSSubAgent } from './sub-agents/rss';
import { ScraperSubAgent } from './sub-agents/scraper';
import { APISubAgent } from './sub-agents/api';
import { NEWS_SOURCES } from './sources.config';

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
   * @param sources 수집 대상 소스 목록 (기본값: NEWS_SOURCES)
   * @returns CollectorResult
   */
  async collect(sources?: NewsSource[]): Promise<CollectorResult>;

  /**
   * 소스를 method별로 그룹핑하여 서브 에이전트에 분배한다.
   */
  private groupSourcesByMethod(sources: NewsSource[]): {
    rss: NewsSource[];
    scraping: NewsSource[];
    api: NewsSource[];
  };

  /**
   * 서브 에이전트들을 Promise.allSettled로 병렬 실행한다.
   */
  private async executeSubAgents(grouped: {
    rss: NewsSource[];
    scraping: NewsSource[];
    api: NewsSource[];
  }): Promise<{ items: NewsItem[]; sourceResults: SourceResult[]; errors: AgentError[] }>;
}
```

### 5.2 RSSSubAgent (`sub-agents/rss.ts`)

```typescript
import Parser from 'rss-parser';
import { v4 as uuidv4 } from 'uuid';
import { NewsItem, NewsSource, SourceResult, AgentError } from '../../../shared/types';

export class RSSSubAgent {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 10000, // 10초 타임아웃
      headers: {
        'User-Agent': 'KDIS-News-Curator/1.0',
      },
    });
  }

  /**
   * 단일 RSS 소스에서 뉴스를 수집한다.
   * @param source RSS 소스 설정
   * @returns { items: NewsItem[], sourceResult: SourceResult }
   */
  async fetchFromSource(source: NewsSource): Promise<{
    items: NewsItem[];
    sourceResult: SourceResult;
  }>;

  /**
   * 여러 RSS 소스를 병렬로 수집한다 (p-limit으로 동시 실행 수 제어, 기본 5개).
   * @param sources RSS 소스 목록
   * @returns { items: NewsItem[], sourceResults: SourceResult[], errors: AgentError[] }
   */
  async fetchAll(sources: NewsSource[]): Promise<{
    items: NewsItem[];
    sourceResults: SourceResult[];
    errors: AgentError[];
  }>;

  /**
   * RSS 피드 아이템을 NewsItem 타입으로 변환한다.
   */
  private toNewsItem(feedItem: Parser.Item, source: NewsSource): NewsItem;
}
```

**구현 세부사항:**
- `rss-parser`의 `parseURL(source.rssUrl)` 호출
- `feedItem.title`, `feedItem.link`, `feedItem.pubDate`, `feedItem.contentSnippet` 또는 `feedItem.content` 매핑
- `publishedAt`: `feedItem.pubDate`를 `new Date()`로 변환, 없으면 `new Date()`
- `content`: `feedItem.contentSnippet || feedItem.content || ''` (최대 500자 truncate)
- `collectedAt`: `new Date()`
- `collectionMethod`: `'rss'`
- 최근 7일 이내의 기사만 수집 (`publishedAt` 기준 필터링)

### 5.3 ScraperSubAgent (`sub-agents/scraper.ts`)

```typescript
import * as cheerio from 'cheerio';
import puppeteer, { Browser } from 'puppeteer';
import { v4 as uuidv4 } from 'uuid';
import { NewsItem, NewsSource, SourceResult, AgentError, ScrapingSelectors } from '../../../shared/types';

export class ScraperSubAgent {
  private browser: Browser | null = null;

  /**
   * Puppeteer 브라우저 인스턴스를 초기화한다.
   * headless: true, 한 번 초기화 후 재사용.
   */
  async initialize(): Promise<void>;

  /**
   * 브라우저 인스턴스를 종료한다. 수집 완료 후 반드시 호출.
   */
  async close(): Promise<void>;

  /**
   * 단일 소스에서 스크래핑으로 뉴스를 수집한다.
   * 1차: fetch + Cheerio (정적 HTML)
   * 2차: Puppeteer (동적 페이지 fallback)
   * @param source 스크래핑 소스 설정
   */
  async fetchFromSource(source: NewsSource): Promise<{
    items: NewsItem[];
    sourceResult: SourceResult;
  }>;

  /**
   * 여러 스크래핑 소스를 순차 실행한다 (p-limit 동시 2개).
   * Puppeteer 리소스 부담 때문에 RSS보다 제한적으로 실행.
   */
  async fetchAll(sources: NewsSource[]): Promise<{
    items: NewsItem[];
    sourceResults: SourceResult[];
    errors: AgentError[];
  }>;

  /**
   * Cheerio로 정적 HTML을 파싱한다.
   */
  private parseWithCheerio(html: string, source: NewsSource): NewsItem[];

  /**
   * Puppeteer로 동적 페이지를 렌더링 후 파싱한다.
   */
  private parseWithPuppeteer(source: NewsSource): Promise<NewsItem[]>;

  /**
   * 상대 URL을 절대 URL로 변환한다.
   */
  private resolveUrl(baseUrl: string, path: string): string;
}
```

**구현 세부사항:**
- `fetchFromSource` 전략:
  1. 먼저 `fetch(source.url)`로 HTML 가져온 후 Cheerio 파싱 시도
  2. 결과가 0건이면 Puppeteer fallback으로 재시도
- Cheerio 파싱 로직:
  ```typescript
  const $ = cheerio.load(html);
  const items: NewsItem[] = [];
  $(selectors.articleList).each((_, el) => {
    const title = $(el).find(selectors.title).text().trim();
    const link = $(el).find(selectors.link).attr('href');
    const date = selectors.date ? $(el).find(selectors.date).text().trim() : '';
    const content = selectors.content ? $(el).find(selectors.content).text().trim() : '';
    if (title && link) {
      items.push({ /* ... */ });
    }
  });
  ```
- Puppeteer 설정:
  ```typescript
  const page = await this.browser!.newPage();
  await page.setUserAgent('KDIS-News-Curator/1.0');
  await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 15000 });
  const html = await page.content();
  await page.close();
  // Cheerio로 파싱
  ```
- 최대 20개 아이템 수집 (소스당)
- `close()` 호출을 `finally` 블록에서 보장

### 5.4 APISubAgent (`sub-agents/api.ts`)

```typescript
import { v4 as uuidv4 } from 'uuid';
import { NewsItem, NewsSource, SourceResult, AgentError } from '../../../shared/types';

export class APISubAgent {
  /**
   * API 소스에서 뉴스를 수집한다.
   * 현재는 OECD Education GPS 등 API 연동 대상이 제한적이므로,
   * RSS fallback 방식으로 구현하되, 향후 전용 API 연동을 추가할 수 있도록 확장 가능하게 설계.
   */
  async fetchFromSource(source: NewsSource): Promise<{
    items: NewsItem[];
    sourceResult: SourceResult;
  }>;

  /**
   * 여러 API 소스를 병렬로 수집한다.
   */
  async fetchAll(sources: NewsSource[]): Promise<{
    items: NewsItem[];
    sourceResults: SourceResult[];
    errors: AgentError[];
  }>;
}
```

**구현 세부사항:**
- 현재 API 전용 소스가 명확하지 않으므로, `api` method로 지정된 소스에 대해:
  1. `rssUrl`이 있으면 RSS 방식으로 fetch (RSSSubAgent 재사용)
  2. 별도 API endpoint가 있으면 `fetch()` + JSON 파싱
- 향후 확장 가능하도록 `fetchFromApi(endpoint, apiKey)` 메서드를 스텁으로 포함

---

## 6. Error Handling 전략

### 6.1 재시도 로직

각 서브 에이전트의 `fetchFromSource`에 재시도 로직을 적용한다:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelay: number; agentName: string; sourceName: string }
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, agentName, sourceName } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt); // exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
```

이 유틸리티는 `src/shared/retry.ts`에 공통으로 구현한다.

### 6.2 에러 수집

- 개별 소스 실패 시 전체 파이프라인을 중단하지 않는다.
- `Promise.allSettled()` 사용으로 모든 소스 실행을 보장한다.
- 실패한 소스는 `SourceResult.success = false`와 `error` 메시지를 기록한다.
- 모든 에러는 `AgentError` 배열에 수집하여 `CollectorResult.errors`로 반환한다.

### 6.3 타임아웃 설정

| 대상 | 타임아웃 |
|------|----------|
| RSS fetch | 10초 |
| Cheerio scraping (fetch) | 10초 |
| Puppeteer page load | 15초 |
| API call | 10초 |
| 전체 Collector 실행 | 120초 (2분) |

---

## 7. Testing 요구사항 (Vitest)

테스트 파일 위치: `tests/unit/collector/`

### 7.1 필수 테스트 목록

```typescript
// tests/unit/collector/rss.test.ts
describe('RSSSubAgent', () => {
  it('유효한 RSS 피드에서 NewsItem[] 을 반환한다');
  it('잘못된 URL에 대해 빈 배열과 에러를 반환한다');
  it('타임아웃 시 적절한 에러를 반환한다');
  it('7일 이전 기사를 필터링한다');
  it('feedItem을 NewsItem 스키마에 맞게 변환한다');
  it('content를 500자로 truncate한다');
});

// tests/unit/collector/scraper.test.ts
describe('ScraperSubAgent', () => {
  it('Cheerio로 정적 HTML에서 뉴스를 추출한다');
  it('상대 URL을 절대 URL로 변환한다');
  it('소스당 최대 20개 아이템을 반환한다');
  it('빈 HTML에서 빈 배열을 반환한다');
  it('Puppeteer fallback이 동작한다');
});

// tests/unit/collector/api.test.ts
describe('APISubAgent', () => {
  it('API 소스에서 NewsItem[] 을 반환한다');
  it('RSS fallback이 정상 동작한다');
});

// tests/unit/collector/index.test.ts
describe('CollectorAgent', () => {
  it('모든 소스를 병렬로 수집한다');
  it('일부 소스 실패 시 나머지 결과를 반환한다');
  it('CollectorResult 스키마에 맞는 결과를 반환한다');
  it('비활성(enabled: false) 소스를 건너뛴다');
  it('sourceResults에 각 소스별 성공/실패 정보를 포함한다');
});
```

### 7.2 테스트 전략

- **Mock 사용**: 실제 네트워크 요청을 하지 않는다. `rss-parser`, `fetch`, `puppeteer`를 mock 처리한다.
- **Fixture 데이터**: `tests/fixtures/` 에 샘플 RSS XML, HTML 파일을 저장하여 사용한다.
- **타입 검증**: 반환값이 `NewsItem` 타입을 만족하는지 검증한다 (필수 필드 존재 여부).

---

## 8. Example Usage

```typescript
import { CollectorAgent } from './agents/collector';

// 기본 사용 (모든 소스에서 수집)
const collector = new CollectorAgent();
const result = await collector.collect();

console.log(`수집 완료: ${result.totalCollected}건`);
console.log(`성공 소스: ${result.sourceResults.filter(r => r.success).length}개`);
console.log(`실패 소스: ${result.sourceResults.filter(r => !r.success).length}개`);
console.log(`에러: ${result.errors.length}건`);

// 특정 소스만 수집
const koreanSources = NEWS_SOURCES.filter(s => s.language === 'ko');
const koreanResult = await collector.collect(koreanSources);

// 수집된 뉴스 아이템 순회
for (const item of result.items) {
  console.log(`[${item.source}] ${item.title} (${item.language})`);
}
```

---

## 9. 구현 시 주의사항

1. **RSS URL 유효성**: 실제 RSS URL은 사이트 정책에 따라 변경될 수 있다. 첫 실행 시 각 URL의 유효성을 확인하고, 404/403 반환 시 대체 URL을 찾아 `sources.config.ts`를 업데이트한다.

2. **스크래핑 셀렉터 유지보수**: 대상 사이트의 HTML 구조가 변경되면 셀렉터를 업데이트해야 한다. 스크래핑 실패 시 명확한 로그를 남긴다.

3. **Rate Limiting**: 같은 도메인에 동시에 다수 요청을 보내지 않도록 `p-limit`으로 동시 실행 수를 제한한다.

4. **한국어 소스 인코딩**: 한국어 사이트는 EUC-KR 인코딩을 사용할 수 있다. `iconv-lite` 패키지를 필요 시 추가하여 인코딩을 변환한다.

5. **Puppeteer 메모리 관리**: Vercel Serverless에서 Puppeteer 실행 시 메모리 제한(1024MB)에 주의한다. `@sparticuz/chromium` 패키지를 사용하여 경량 Chromium을 번들링한다.

6. **content 필드**: 원문 전체가 아닌 발취문(snippet)을 저장한다. 저작권 보호를 위해 최대 500자로 제한한다.
