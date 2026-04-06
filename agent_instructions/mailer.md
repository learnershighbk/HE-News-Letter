# Mailer Agent - 이메일 발송 에이전트 구현 명세

## 1. 에이전트 개요

Mailer Agent는 큐레이션된 뉴스를 반응형 HTML 이메일 뉴스레터로 포맷팅하여 KDI대학원 교원/경영진에게 발송하는 에이전트이다. **Stibee API**를 기본 발송 플랫폼으로 사용하며, **Resend**를 백업으로 지원한다. 뉴스레터는 한국어를 주 언어로, 영어를 병기하는 바이링구얼 형식이다.

**담당 파일 구조:**
```
src/agents/mailer/
  ├── index.ts              # MailerAgent 메인 클래스
  └── templates/
      ├── newsletter.ts     # HTML 뉴스레터 템플릿 빌더
      └── styles.ts         # 인라인 CSS 스타일 정의
```

---

## 2. Dependencies (npm packages)

```json
{
  "resend": "^4.0.0"
}
```

- `resend`: Resend 이메일 API (백업 발송)
- Stibee API: REST API 직접 호출 (`fetch` 사용, 별도 SDK 없음)

환경변수:
- `STIBEE_API_KEY`: Stibee API 키 (필수)
- `RESEND_API_KEY`: Resend API 키 (백업용)
- `NEWSLETTER_FROM_EMAIL`: 발송자 이메일 주소 (예: "edupulse@kdis.ac.kr")
- `NEWSLETTER_FROM_NAME`: 발송자 이름 (예: "KDI EduPulse")

---

## 3. Input/Output 타입

`src/shared/types.ts`에서 import하여 사용한다:

```typescript
// Input
import { CuratedNewsItem, Recipient } from '../../shared/types';

// Output
import { MailerResult, AgentError } from '../../shared/types';
```

### Input
- `items: CuratedNewsItem[]` - 큐레이션된 뉴스 아이템 (우선순위별 분류됨)
- `recipients: Recipient[]` - 수신자 목록
- `issueNumber: number` - 뉴스레터 호수

### Output
- `MailerResult`
  - `sent: boolean` - 발송 성공 여부
  - `recipientCount: number` - 수신자 수
  - `issueNumber: number` - 뉴스레터 호수
  - `subject: string` - 이메일 제목
  - `errors: AgentError[]` - 에러 목록

---

## 4. 뉴스레터 구조 (PRD 3.5.1)

```
┌──────────────────────────────────────────────────┐
│  HEADER                                           │
│  KDI School EduPulse | #호수 | 발행일             │
├──────────────────────────────────────────────────┤
│  편집자 인사말 (AI 생성, 1-2문장)                  │
├──────────────────────────────────────────────────┤
│  🔥 필독 뉴스 (Must-Read) - 2~3개                 │
│  ┌────────────────────────────────────────────┐  │
│  │ [카테고리] 제목                              │  │
│  │ 한국어 요약 (2-3문장)                        │  │
│  │ English summary (1 sentence)               │  │
│  │ 💡 KDI 시사점: ...                          │  │
│  │ [원문 보기 →]                               │  │
│  └────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────┤
│  ⭐ 추천 뉴스 (Recommended) - 5~8개               │
│  • [카테고리] 제목 - 1줄 요약 [원문 →]            │
│  • [카테고리] 제목 - 1줄 요약 [원문 →]            │
│  ...                                              │
├──────────────────────────────────────────────────┤
│  📌 참고 뉴스 (Reference) - 나머지                 │
│  • 제목 (출처) [→]                                │
│  • 제목 (출처) [→]                                │
│  ...                                              │
├──────────────────────────────────────────────────┤
│  FOOTER                                           │
│  발송 정보 | 노션 아카이브 | 구독 관리             │
└──────────────────────────────────────────────────┘
```

---

## 5. Core Functions 구현

### 5.1 MailerAgent 메인 클래스 (`index.ts`)

```typescript
import { CuratedNewsItem, Recipient, MailerResult, AgentError } from '../../shared/types';
import { buildNewsletterHtml } from './templates/newsletter';

export class MailerAgent {
  private stibeeApiKey: string;
  private resendApiKey: string | undefined;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.stibeeApiKey = process.env.STIBEE_API_KEY!;
    this.resendApiKey = process.env.RESEND_API_KEY;
    this.fromEmail = process.env.NEWSLETTER_FROM_EMAIL || 'edupulse@kdis.ac.kr';
    this.fromName = process.env.NEWSLETTER_FROM_NAME || 'KDI EduPulse';
  }

  /**
   * 뉴스레터를 생성하고 발송한다.
   * 1. HTML 뉴스레터를 빌드한다
   * 2. Stibee API로 발송을 시도한다
   * 3. Stibee 실패 시 Resend로 fallback 발송한다
   * @param items 큐레이션된 뉴스 아이템 (우선순위별 분류됨)
   * @param recipients 수신자 목록
   * @param issueNumber 뉴스레터 호수
   */
  async send(
    items: CuratedNewsItem[],
    recipients: Recipient[],
    issueNumber: number
  ): Promise<MailerResult>;

  /**
   * 이메일 제목을 생성한다.
   * 형식: [KDI EduPulse] #호수 - 주요 헤드라인 (MM/DD)
   * @param issueNumber 호수
   * @param topHeadline 가장 높은 점수의 뉴스 제목
   */
  private buildSubject(issueNumber: number, topHeadline: string): string;

  /**
   * Stibee API로 이메일을 발송한다.
   * @param subject 이메일 제목
   * @param html HTML 본문
   * @param recipients 수신자 목록
   */
  private async sendViaStibee(
    subject: string,
    html: string,
    recipients: Recipient[]
  ): Promise<void>;

  /**
   * Resend API로 이메일을 발송한다 (백업).
   * @param subject 이메일 제목
   * @param html HTML 본문
   * @param recipients 수신자 목록
   */
  private async sendViaResend(
    subject: string,
    html: string,
    recipients: Recipient[]
  ): Promise<void>;

  /**
   * 뉴스 아이템을 우선순위별로 분류한다.
   */
  private groupByPriority(items: CuratedNewsItem[]): {
    mustRead: CuratedNewsItem[];
    recommended: CuratedNewsItem[];
    reference: CuratedNewsItem[];
  };
}
```

### 5.2 이메일 제목 생성

```typescript
private buildSubject(issueNumber: number, topHeadline: string): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  // 제목이 너무 길면 30자로 truncate
  const headline = topHeadline.length > 30
    ? topHeadline.substring(0, 30) + '...'
    : topHeadline;

  return `[KDI EduPulse] #${issueNumber} - ${headline} (${month}/${day})`;
}
```

### 5.3 HTML 뉴스레터 템플릿 (`templates/newsletter.ts`)

```typescript
import { CuratedNewsItem } from '../../../shared/types';
import { STYLES } from './styles';

interface NewsletterData {
  issueNumber: number;
  publishDate: string;
  greeting: string;
  mustRead: CuratedNewsItem[];
  recommended: CuratedNewsItem[];
  reference: CuratedNewsItem[];
  notionArchiveUrl?: string;
}

/**
 * 뉴스레터 전체 HTML을 생성한다.
 * 이메일 클라이언트 호환성을 위해 table 레이아웃 + 인라인 CSS를 사용한다.
 */
export function buildNewsletterHtml(data: NewsletterData): string;

/**
 * 헤더 섹션 HTML을 생성한다.
 */
function buildHeader(issueNumber: number, publishDate: string): string;

/**
 * 편집자 인사말 섹션 HTML을 생성한다.
 * 이 인사말은 Orchestrator에서 Claude API로 생성하여 전달하거나,
 * 미리 정의된 템플릿에서 랜덤 선택한다.
 */
function buildGreeting(greeting: string): string;

/**
 * 필독 뉴스 섹션 HTML을 생성한다.
 * 각 아이템: 카테고리 배지 + 제목 + 한국어 요약 + 영어 요약 + KDI 시사점 + 원문 링크
 */
function buildMustReadSection(items: CuratedNewsItem[]): string;

/**
 * 추천 뉴스 섹션 HTML을 생성한다.
 * 각 아이템: 카테고리 배지 + 제목 + 1줄 요약 + 원문 링크
 */
function buildRecommendedSection(items: CuratedNewsItem[]): string;

/**
 * 참고 뉴스 섹션 HTML을 생성한다.
 * 각 아이템: 제목 (출처) + 원문 링크
 */
function buildReferenceSection(items: CuratedNewsItem[]): string;

/**
 * 푸터 섹션 HTML을 생성한다.
 * 발송 정보, 노션 아카이브 링크, 구독 취소 링크
 */
function buildFooter(notionArchiveUrl?: string): string;
```

### 5.4 인라인 CSS 스타일 (`templates/styles.ts`)

```typescript
/**
 * 이메일 클라이언트 호환 인라인 CSS 스타일 상수.
 * Gmail, Outlook, Apple Mail 호환성을 보장한다.
 */
export const STYLES = {
  // 전체 레이아웃
  body: 'margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
  container: 'max-width: 640px; margin: 0 auto; background-color: #ffffff;',

  // 헤더
  header: 'background-color: #003366; color: #ffffff; padding: 24px 32px; text-align: center;',
  headerTitle: 'font-size: 24px; font-weight: bold; margin: 0; color: #ffffff;',
  headerSubtitle: 'font-size: 14px; color: #99ccff; margin-top: 8px;',

  // 인사말
  greeting: 'padding: 24px 32px; font-size: 15px; line-height: 1.6; color: #333333; border-bottom: 1px solid #eeeeee;',

  // 섹션 헤더
  sectionTitle: 'font-size: 18px; font-weight: bold; padding: 20px 32px 12px; color: #333333;',

  // 필독 뉴스 카드
  mustReadCard: 'margin: 0 32px 16px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; border-left: 4px solid #ff4444;',
  mustReadTitle: 'font-size: 16px; font-weight: bold; color: #333333; margin-bottom: 8px;',

  // 추천 뉴스 아이템
  recommendedItem: 'padding: 12px 32px; border-bottom: 1px solid #f0f0f0;',
  recommendedTitle: 'font-size: 14px; font-weight: bold; color: #333333;',

  // 참고 뉴스 아이템
  referenceItem: 'padding: 8px 32px; font-size: 13px; color: #666666;',

  // 카테고리 배지
  categoryBadge: 'display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 4px; background-color: #e8f0fe; color: #1a73e8; margin-right: 4px;',

  // 시사점
  insight: 'font-size: 13px; color: #666666; padding: 8px 12px; margin-top: 8px; background-color: #f8f9fa; border-radius: 4px;',

  // 링크
  link: 'color: #1a73e8; text-decoration: none;',
  ctaLink: 'display: inline-block; color: #1a73e8; font-size: 13px; font-weight: bold; text-decoration: none;',

  // 푸터
  footer: 'padding: 24px 32px; background-color: #f8f9fa; text-align: center; font-size: 12px; color: #999999;',
} as const;
```

### 5.5 Stibee API 발송

```typescript
private async sendViaStibee(
  subject: string,
  html: string,
  recipients: Recipient[]
): Promise<void> {
  // Stibee API: 수동 이메일 발송
  // API 문서: https://developers.stibee.com
  const response = await fetch('https://api.stibee.com/v1/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'AccessToken': this.stibeeApiKey,
    },
    body: JSON.stringify({
      subscriber: recipients.map(r => r.email),
      subject: subject,
      content: html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Stibee API 에러 (${response.status}): ${errorBody}`);
  }
}
```

> **참고**: Stibee API의 정확한 endpoint와 요청 형식은 실제 API 문서(https://developers.stibee.com)를 확인하여 조정해야 한다. 위 코드는 예상 형식이며, 실제 구현 시 Stibee의 "수동 메일 발송" 또는 "자동 메일" API 문서를 기반으로 수정한다.

### 5.6 Resend API 발송 (백업)

```typescript
import { Resend } from 'resend';

private async sendViaResend(
  subject: string,
  html: string,
  recipients: Recipient[]
): Promise<void> {
  const resend = new Resend(this.resendApiKey);

  // Resend는 한 번에 최대 50명까지 발송 가능
  // 수신자가 50명 이상이면 배치로 분할
  const BATCH_SIZE = 50;
  const batches = chunk(recipients, BATCH_SIZE);

  for (const batch of batches) {
    await resend.emails.send({
      from: `${this.fromName} <${this.fromEmail}>`,
      to: batch.map(r => r.email),
      subject,
      html,
    });

    // 배치 간 500ms 대기
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
```

---

## 6. 발송 흐름

```typescript
async send(
  items: CuratedNewsItem[],
  recipients: Recipient[],
  issueNumber: number
): Promise<MailerResult> {
  const errors: AgentError[] = [];

  // 1. 우선순위별 분류
  const { mustRead, recommended, reference } = this.groupByPriority(items);

  // 2. 이메일 제목 생성
  const topHeadline = mustRead[0]?.title || recommended[0]?.title || '이번 주 고등교육 뉴스';
  const subject = this.buildSubject(issueNumber, topHeadline);

  // 3. HTML 뉴스레터 생성
  const now = new Date();
  const publishDate = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
  const greeting = generateGreeting(mustRead); // 인사말 생성

  const html = buildNewsletterHtml({
    issueNumber,
    publishDate,
    greeting,
    mustRead,
    recommended,
    reference,
  });

  // 4. Stibee로 발송 시도
  try {
    await this.sendViaStibee(subject, html, recipients);
    return {
      sent: true,
      recipientCount: recipients.length,
      issueNumber,
      subject,
      errors,
    };
  } catch (stibeeError) {
    errors.push({
      agent: 'mailer',
      message: `Stibee 발송 실패: ${(stibeeError as Error).message}`,
      timestamp: new Date(),
    });
  }

  // 5. Stibee 실패 시 Resend fallback
  if (this.resendApiKey) {
    try {
      await this.sendViaResend(subject, html, recipients);
      return {
        sent: true,
        recipientCount: recipients.length,
        issueNumber,
        subject,
        errors, // Stibee 에러는 포함하되 sent=true
      };
    } catch (resendError) {
      errors.push({
        agent: 'mailer',
        message: `Resend 발송 실패: ${(resendError as Error).message}`,
        timestamp: new Date(),
      });
    }
  }

  // 6. 모두 실패
  return {
    sent: false,
    recipientCount: 0,
    issueNumber,
    subject,
    errors,
  };
}
```

---

## 7. 편집자 인사말 생성

인사말은 필독 뉴스를 기반으로 간단한 도입문을 생성한다. Claude API 호출 비용을 줄이기 위해, 템플릿 기반 생성을 기본으로 한다:

```typescript
function generateGreeting(mustRead: CuratedNewsItem[]): string {
  const today = new Date();
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];

  if (mustRead.length === 0) {
    return `안녕하세요, ${dayOfWeek}요일 아침입니다. 이번 주 고등교육 및 AI 뉴스를 정리해 보내드립니다.`;
  }

  const topCategories = [...new Set(mustRead.flatMap(item => item.categories))].slice(0, 2);
  return `안녕하세요, ${dayOfWeek}요일 아침입니다. 이번 주는 ${topCategories.join(', ')} 분야에서 주목할 만한 소식이 있습니다.`;
}
```

---

## 8. Error Handling 전략

### 8.1 발송 에러 처리

| 에러 유형 | 대응 |
|-----------|------|
| Stibee API 에러 | 에러 로그 기록 후 Resend fallback |
| Resend API 에러 | 에러 로그 기록, `sent: false` 반환 |
| HTML 생성 에러 | 즉시 실패, 에러 반환 |
| 수신자 목록 비어있음 | 발송 건너뛰기, 경고 로그 |

### 8.2 재시도 로직

```typescript
import { withRetry } from '../../shared/retry';

// Stibee 발송에 재시도 적용
await withRetry(
  () => this.sendViaStibee(subject, html, recipients),
  { maxRetries: 2, baseDelay: 3000, agentName: 'mailer', sourceName: 'stibee' }
);
```

---

## 9. Testing 요구사항 (Vitest)

테스트 파일 위치: `tests/unit/mailer/`

### 9.1 필수 테스트 목록

```typescript
// tests/unit/mailer/index.test.ts
describe('MailerAgent', () => {
  it('뉴스레터를 Stibee로 발송한다');
  it('Stibee 실패 시 Resend로 fallback한다');
  it('모든 플랫폼 실패 시 sent=false를 반환한다');
  it('수신자가 없으면 발송을 건너뛴다');
  it('MailerResult에 올바른 정보를 반환한다');
  it('이메일 제목이 올바른 형식이다');
});

// tests/unit/mailer/newsletter.test.ts
describe('Newsletter Template', () => {
  it('올바른 HTML 구조를 생성한다');
  it('필독 뉴스 섹션에 mustRead 아이템이 포함된다');
  it('추천 뉴스 섹션에 recommended 아이템이 포함된다');
  it('참고 뉴스 섹션에 reference 아이템이 포함된다');
  it('빈 섹션은 렌더링하지 않는다');
  it('원문 URL 링크가 올바르게 삽입된다');
  it('카테고리 배지가 표시된다');
  it('KDI 시사점이 필독 뉴스에 포함된다');
  it('한국어/영어 요약이 모두 표시된다');
});

// tests/unit/mailer/subject.test.ts
describe('Subject Builder', () => {
  it('[KDI EduPulse] #호수 - 헤드라인 (MM/DD) 형식을 따른다');
  it('긴 헤드라인을 30자로 truncate한다');
  it('뉴스가 없을 때 기본 헤드라인을 사용한다');
});
```

### 9.2 테스트 전략

- **API Mock**: `fetch`와 `Resend`를 mock하여 실제 이메일을 보내지 않는다.
- **HTML 스냅샷 테스트**: 생성된 HTML의 구조를 스냅샷으로 저장하고, 의도치 않은 변경을 감지한다.
- **반응형 테스트**: HTML이 640px 이하에서도 적절히 렌더링되는지 확인 (인라인 CSS 검증).

---

## 10. Example Usage

```typescript
import { MailerAgent } from './agents/mailer';
import { CuratedNewsItem, Recipient } from './shared/types';

const mailer = new MailerAgent();

const curatedItems: CuratedNewsItem[] = [/* Curator Agent 결과 */];
const recipients: Recipient[] = [
  { email: 'professor@kdis.ac.kr', name: '교수님' },
  { email: 'dean@kdis.ac.kr', name: '학장님' },
];
const issueNumber = 12;

const result = await mailer.send(curatedItems, recipients, issueNumber);

console.log(`발송 결과: ${result.sent ? '성공' : '실패'}`);
console.log(`수신자: ${result.recipientCount}명`);
console.log(`제목: ${result.subject}`);

if (result.errors.length > 0) {
  result.errors.forEach(e => console.error(`에러: ${e.message}`));
}
```

---

## 11. 구현 시 주의사항

1. **Stibee API 확인**: Stibee API의 정확한 endpoint, 인증 방식, 요청/응답 형식은 공식 문서(https://developers.stibee.com)를 확인해야 한다. 위 코드의 API 호출은 예상 형식이며, 실제 구현 시 조정이 필요하다. Stibee는 구독자 목록 기반 발송이 일반적이므로, "수동 이메일" 또는 "트랜잭셔널 이메일" API를 사용할 수 있다.

2. **이메일 HTML 호환성**: 이메일 클라이언트(Gmail, Outlook, Apple Mail 등)는 CSS 지원이 제한적이다. 반드시 **table 레이아웃**과 **인라인 CSS**를 사용해야 한다. `<div>`, `flexbox`, `grid`는 사용하지 않는다.

3. **반응형 디자인**: `max-width: 640px`로 제한하고, 모바일에서도 읽기 좋도록 폰트 크기를 최소 13px 이상으로 유지한다. `@media` 쿼리는 일부 클라이언트에서만 지원되므로 기본 레이아웃이 모바일 친화적이어야 한다.

4. **이미지 사용 자제**: KDI School 로고 등 이미지는 외부 URL로 참조하되, 이미지 차단 시에도 레이아웃이 깨지지 않도록 `alt` 텍스트를 제공한다.

5. **구독 취소 링크**: CAN-SPAM 법률 준수를 위해 구독 취소 링크를 반드시 포함한다. Stibee 사용 시 자동으로 포함되지만, Resend 사용 시 별도로 추가해야 한다.

6. **발송 시간**: PRD에 따르면 매주 월요일 오전 9시(KST)에 발송한다. 이 스케줄링은 Orchestrator Agent의 cron 설정에서 관리한다.
