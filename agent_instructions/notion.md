# Notion Agent - 노션 저장 에이전트 구현 명세

## 1. 에이전트 개요

Notion Agent는 Curator Agent가 큐레이션한 `CuratedNewsItem[]`을 Notion 데이터베이스에 구조화된 형태로 저장하고, 파이프라인 실행 로그를 별도 Log DB에 기록하는 에이전트이다. 각 뉴스 아이템은 Notion 페이지로 생성되며, 상태(Status) 추적을 통해 파이프라인 진행 상황을 관리한다.

**담당 파일 구조:**
```
src/agents/notion/
  ├── index.ts     # NotionAgent 메인 클래스
  └── schema.ts    # Notion DB 프로퍼티 매핑 유틸리티
```

---

## 2. Dependencies (npm packages)

```json
{
  "@notionhq/client": "^2.2.0"
}
```

- `@notionhq/client`: Notion 공식 API 클라이언트

환경변수:
- `NOTION_TOKEN`: Notion Integration 토큰 (필수)
- `NOTION_DB_ID`: 뉴스 저장용 데이터베이스 ID (필수)
- `NOTION_LOG_DB_ID`: 파이프라인 실행 로그 데이터베이스 ID (필수)

---

## 3. Input/Output 타입

`src/shared/types.ts`에서 import하여 사용한다:

```typescript
// Input
import { CuratedNewsItem, PipelineLog, PipelineResult } from '../../shared/types';

// Output
import { NotionResult, AgentError } from '../../shared/types';
```

### Input
- `items: CuratedNewsItem[]` - 큐레이션된 뉴스 아이템 배열
- `pipelineLog: PipelineLog` - 파이프라인 실행 로그 (Log DB 기록용)

### Output
- `NotionResult`
  - `createdPages: string[]` - 생성된 Notion 페이지 ID 배열
  - `totalStored: number` - 총 저장 건수
  - `errors: AgentError[]` - 에러 목록

---

## 4. Notion 데이터베이스 스키마

### 4.1 뉴스 DB (News Database)

PRD 섹션 3.4.1에 정의된 스키마를 따른다:

| 필드명 | Notion Property Type | 매핑 소스 |
|--------|---------------------|-----------|
| Title | `title` | `item.title` |
| Source | `select` | `item.source` |
| Category | `multi_select` | `item.categories` |
| Priority | `select` | `item.priority` ("필독"/"추천"/"참고") |
| Relevance Score | `number` | `item.relevanceScore` |
| Summary (KO) | `rich_text` | `item.summaryKo` |
| Summary (EN) | `rich_text` | `item.summaryEn` |
| KDI Insight | `rich_text` | `item.kdiInsight` |
| Original URL | `url` | `item.url` |
| Published Date | `date` | `item.publishedAt` |
| Collected Date | `date` | `item.collectedAt` |
| Newsletter Issue | `relation` | 뉴스레터 호수 (발송 시 연결) |
| Tags | `multi_select` | `item.tags` |
| Status | `select` | "collected" / "curated" / "sent" |

### 4.2 Log DB (Pipeline Log Database)

| 필드명 | Notion Property Type | 매핑 소스 |
|--------|---------------------|-----------|
| Run ID | `title` | `log.runId` |
| Timestamp | `date` | `log.timestamp` |
| Status | `select` | "success" / "partial" / "failed" |
| Total Collected | `number` | `result.collector.totalCollected` |
| Total Curated | `number` | `result.curator.totalPassed` |
| Total Stored | `number` | `result.notion.totalStored` |
| Email Sent | `checkbox` | `result.mailer.sent` |
| Errors | `rich_text` | 에러 요약 텍스트 |
| Duration (sec) | `number` | 실행 시간(초) |
| Details | `rich_text` | JSON 상세 정보 |

---

## 5. Core Functions 구현

### 5.1 NotionAgent 메인 클래스 (`index.ts`)

```typescript
import { Client } from '@notionhq/client';
import { CuratedNewsItem, NotionResult, AgentError, PipelineResult, PipelineLog } from '../../shared/types';
import { buildNewsPageProperties, buildLogPageProperties } from './schema';

export class NotionAgent {
  private client: Client;
  private newsDbId: string;
  private logDbId: string;

  constructor() {
    this.client = new Client({
      auth: process.env.NOTION_TOKEN,
    });
    this.newsDbId = process.env.NOTION_DB_ID!;
    this.logDbId = process.env.NOTION_LOG_DB_ID!;
  }

  /**
   * 큐레이션된 뉴스 아이템을 Notion 뉴스 DB에 저장한다.
   * 각 아이템을 Notion 페이지로 생성하며, 중복 체크(URL 기준)를 수행한다.
   * @param items 큐레이션된 뉴스 아이템 배열
   * @returns NotionResult
   */
  async store(items: CuratedNewsItem[]): Promise<NotionResult>;

  /**
   * 단일 뉴스 아이템을 Notion 페이지로 생성한다.
   * @param item 큐레이션된 뉴스 아이템
   * @returns 생성된 페이지 ID
   */
  private async createNewsPage(item: CuratedNewsItem): Promise<string>;

  /**
   * URL 기준으로 이미 DB에 존재하는 뉴스인지 확인한다.
   * Notion DB 쿼리를 사용하여 중복 체크.
   * @param url 뉴스 원문 URL
   * @returns 이미 존재하면 true
   */
  private async isDuplicate(url: string): Promise<boolean>;

  /**
   * 뉴스 페이지의 Status를 업데이트한다.
   * @param pageId Notion 페이지 ID
   * @param status 새 상태값
   */
  async updateStatus(pageId: string, status: 'collected' | 'curated' | 'sent'): Promise<void>;

  /**
   * 파이프라인 실행 로그를 Log DB에 기록한다.
   * @param result 파이프라인 실행 결과
   */
  async logPipelineRun(result: PipelineResult): Promise<void>;

  /**
   * 가장 최근 뉴스레터 호수를 조회하여 다음 호수를 반환한다.
   * Log DB에서 마지막 성공 실행을 조회.
   * @returns 다음 뉴스레터 호수 (number)
   */
  async getNextIssueNumber(): Promise<number>;
}
```

### 5.2 프로퍼티 매핑 유틸리티 (`schema.ts`)

```typescript
import { CuratedNewsItem, PipelineResult } from '../../shared/types';

/** Priority 한글 매핑 */
const PRIORITY_LABELS: Record<string, string> = {
  'must-read': '필독',
  'recommended': '추천',
  'reference': '참고',
};

/**
 * CuratedNewsItem을 Notion 페이지 프로퍼티로 변환한다.
 */
export function buildNewsPageProperties(item: CuratedNewsItem): Record<string, any> {
  return {
    Title: {
      title: [{ text: { content: item.title } }],
    },
    Source: {
      select: { name: item.source },
    },
    Category: {
      multi_select: item.categories.map(cat => ({ name: cat })),
    },
    Priority: {
      select: { name: PRIORITY_LABELS[item.priority] || item.priority },
    },
    'Relevance Score': {
      number: item.relevanceScore,
    },
    'Summary (KO)': {
      rich_text: [{ text: { content: truncate(item.summaryKo, 2000) } }],
    },
    'Summary (EN)': {
      rich_text: [{ text: { content: truncate(item.summaryEn, 2000) } }],
    },
    'KDI Insight': {
      rich_text: [{ text: { content: truncate(item.kdiInsight, 2000) } }],
    },
    'Original URL': {
      url: item.url,
    },
    'Published Date': {
      date: { start: toISODate(item.publishedAt) },
    },
    'Collected Date': {
      date: { start: toISODate(item.collectedAt) },
    },
    Tags: {
      multi_select: item.tags.map(tag => ({ name: tag })),
    },
    Status: {
      select: { name: 'curated' },
    },
  };
}

/**
 * PipelineResult를 Log DB 페이지 프로퍼티로 변환한다.
 */
export function buildLogPageProperties(result: PipelineResult): Record<string, any> {
  const durationSec = Math.round(
    (result.completedAt.getTime() - result.startedAt.getTime()) / 1000
  );
  const errorSummary = result.errors
    .map(e => `[${e.agent}] ${e.message}`)
    .join('\n')
    .substring(0, 2000);

  return {
    'Run ID': {
      title: [{ text: { content: result.runId } }],
    },
    Timestamp: {
      date: { start: result.startedAt.toISOString() },
    },
    Status: {
      select: { name: result.status },
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
      rich_text: [{ text: { content: errorSummary || 'None' } }],
    },
    'Duration (sec)': {
      number: durationSec,
    },
    Details: {
      rich_text: [{ text: { content: truncate(JSON.stringify({
        collector: { total: result.collector.totalCollected, errors: result.collector.errors.length },
        curator: { processed: result.curator.totalProcessed, passed: result.curator.totalPassed },
        mailer: { sent: result.mailer.sent, recipients: result.mailer.recipientCount },
      }), 2000) } }],
    },
  };
}

/** 문자열을 maxLength로 truncate한다 (Notion rich_text 제한 대응) */
function truncate(str: string, maxLength: number): string {
  return str.length > maxLength ? str.substring(0, maxLength - 3) + '...' : str;
}

/** Date를 ISO 8601 날짜 문자열로 변환한다 */
function toISODate(date: Date): string {
  return date instanceof Date ? date.toISOString().split('T')[0] : String(date);
}
```

---

## 6. 주요 구현 로직

### 6.1 뉴스 저장 (`store`)

```typescript
async store(items: CuratedNewsItem[]): Promise<NotionResult> {
  const createdPages: string[] = [];
  const errors: AgentError[] = [];

  for (const item of items) {
    try {
      // 중복 체크
      const duplicate = await this.isDuplicate(item.url);
      if (duplicate) {
        continue; // 이미 존재하면 건너뛰기
      }

      const pageId = await this.createNewsPage(item);
      createdPages.push(pageId);
    } catch (error) {
      errors.push({
        agent: 'notion',
        message: `페이지 생성 실패 [${item.title}]: ${(error as Error).message}`,
        timestamp: new Date(),
      });
    }

    // Notion API rate limit 대응: 요청 간 300ms 대기
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return {
    createdPages,
    totalStored: createdPages.length,
    errors,
  };
}
```

### 6.2 중복 체크 (`isDuplicate`)

```typescript
private async isDuplicate(url: string): Promise<boolean> {
  const response = await this.client.databases.query({
    database_id: this.newsDbId,
    filter: {
      property: 'Original URL',
      url: { equals: url },
    },
    page_size: 1,
  });

  return response.results.length > 0;
}
```

### 6.3 페이지 생성 (`createNewsPage`)

```typescript
private async createNewsPage(item: CuratedNewsItem): Promise<string> {
  const properties = buildNewsPageProperties(item);

  const response = await this.client.pages.create({
    parent: { database_id: this.newsDbId },
    properties,
  });

  return response.id;
}
```

---

## 7. Error Handling 전략

### 7.1 Notion API 에러 처리

| 에러 유형 | HTTP 상태 | 대응 |
|-----------|-----------|------|
| `rate_limited` | 429 | `Retry-After` 헤더 값만큼 대기 후 재시도 |
| `validation_error` | 400 | 프로퍼티 매핑 오류 로그, 해당 아이템 건너뛰기 |
| `unauthorized` | 401 | 즉시 실패, NOTION_TOKEN 확인 필요 |
| `object_not_found` | 404 | DB ID 확인 필요, 에러 반환 |
| `internal_server_error` | 500 | 3초 대기 후 재시도 (최대 3회) |

### 7.2 재시도 로직

```typescript
import { withRetry } from '../../shared/retry';

// 페이지 생성에 재시도 적용
const pageId = await withRetry(
  () => this.createNewsPage(item),
  { maxRetries: 3, baseDelay: 1000, agentName: 'notion', sourceName: item.source }
);
```

### 7.3 Rate Limiting 대응

Notion API는 초당 3회 요청 제한이 있다. 각 요청 사이에 최소 300ms 간격을 두고, 429 응답 시 `Retry-After` 헤더를 참조한다.

---

## 8. Testing 요구사항 (Vitest)

테스트 파일 위치: `tests/unit/notion/`

### 8.1 필수 테스트 목록

```typescript
// tests/unit/notion/index.test.ts
describe('NotionAgent', () => {
  it('CuratedNewsItem을 Notion 페이지로 생성한다');
  it('중복 URL의 뉴스를 건너뛴다');
  it('NotionResult에 올바른 createdPages와 totalStored를 반환한다');
  it('페이지 생성 실패 시 에러를 수집하고 나머지를 계속 처리한다');
  it('파이프라인 로그를 Log DB에 기록한다');
  it('다음 뉴스레터 호수를 올바르게 계산한다');
  it('Status 업데이트가 정상 동작한다');
});

// tests/unit/notion/schema.test.ts
describe('Schema', () => {
  it('buildNewsPageProperties가 올바른 Notion 프로퍼티 형식을 반환한다');
  it('Priority를 한글로 매핑한다 (must-read → 필독)');
  it('categories를 multi_select로 변환한다');
  it('tags를 multi_select로 변환한다');
  it('날짜를 ISO 형식으로 변환한다');
  it('긴 텍스트를 2000자로 truncate한다');
  it('buildLogPageProperties가 올바른 Log 프로퍼티를 반환한다');
});
```

### 8.2 테스트 전략

- **Notion API Mock**: `@notionhq/client`를 mock하여 테스트. `vi.mock('@notionhq/client')`로 `Client` 클래스를 모킹한다.
- **프로퍼티 변환 테스트**: `schema.ts`의 순수 함수들은 mock 없이 직접 테스트한다.
- **중복 체크 테스트**: `databases.query`의 mock 응답을 통해 중복/비중복 케이스를 테스트한다.
- **에러 시나리오**: API 에러 발생 시 에러를 수집하면서 나머지 아이템 처리를 계속하는지 검증한다.

---

## 9. Example Usage

```typescript
import { NotionAgent } from './agents/notion';
import { CuratedNewsItem } from './shared/types';

const notion = new NotionAgent();

// 큐레이션된 뉴스를 Notion에 저장
const curatedItems: CuratedNewsItem[] = [/* Curator Agent 결과 */];
const result = await notion.store(curatedItems);

console.log(`저장 완료: ${result.totalStored}건`);
console.log(`생성된 페이지: ${result.createdPages.join(', ')}`);

if (result.errors.length > 0) {
  console.error(`에러 ${result.errors.length}건:`);
  result.errors.forEach(e => console.error(`  - ${e.message}`));
}

// 상태 업데이트 (메일 발송 후)
for (const pageId of result.createdPages) {
  await notion.updateStatus(pageId, 'sent');
}

// 파이프라인 로그 기록
const pipelineResult: PipelineResult = {/* ... */};
await notion.logPipelineRun(pipelineResult);

// 다음 뉴스레터 호수 조회
const nextIssue = await notion.getNextIssueNumber();
console.log(`다음 뉴스레터: #${nextIssue}`);
```

---

## 10. 구현 시 주의사항

1. **Notion DB 사전 생성**: 코드에서 DB를 생성하지 않는다. 뉴스 DB와 Log DB는 Notion에서 미리 생성하고, DB ID를 환경변수에 설정해야 한다. DB의 프로퍼티가 스키마와 일치하는지 확인한다.

2. **프로퍼티 이름 일치**: Notion API는 프로퍼티 이름이 정확히 일치해야 한다. DB에 생성한 프로퍼티 이름과 코드의 프로퍼티 이름이 동일한지 확인한다.

3. **rich_text 길이 제한**: Notion API의 rich_text 블록은 최대 2000자이다. `truncate()` 함수로 초과분을 잘라야 한다.

4. **Rate Limiting**: Notion API는 초당 3회 제한이 있다. 대량 저장 시 반드시 요청 간 간격을 둔다.

5. **Select/Multi-select 옵션**: 새로운 select/multi_select 값은 Notion이 자동으로 생성하지만, 미리 정의된 옵션을 사용하면 색상 일관성을 유지할 수 있다. DB에 카테고리, 우선순위, 소스 옵션을 미리 생성해두는 것을 권장한다.

6. **Relation 필드**: Newsletter Issue relation은 별도의 뉴스레터 DB가 필요하다. 초기 구현에서는 relation을 비워두고, 향후 뉴스레터 DB 연동 시 추가한다.
