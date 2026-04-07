// ============================================================
// Mailer Agent - 뉴스레터 이메일 발송
// Primary: Stibee API / Fallback: Resend API
// ============================================================

import { Logger } from '../../shared/logger.js';
import { withRetry } from '../../shared/retry.js';
import type {
  CuratedNewsItem,
  MailerResult,
  Recipient,
  AgentError,
} from '../../shared/types.js';
import { buildNewsletterHtml, type NewsletterData } from './templates/newsletter.js';

// --- Constants ---

const AGENT_NAME = 'mailer';
const STIBEE_API_BASE = 'https://api.stibee.com/v1';

// --- Types ---

interface GroupedItems {
  mustRead: CuratedNewsItem[];
  recommended: CuratedNewsItem[];
  reference: CuratedNewsItem[];
}

// --- MailerAgent ---

export class MailerAgent {
  private logger: Logger;
  private stibeeApiKey: string | undefined;
  private resendApiKey: string | undefined;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.stibeeApiKey = process.env.STIBEE_API_KEY;
    this.resendApiKey = process.env.RESEND_API_KEY;
    this.fromEmail = process.env.NEWSLETTER_FROM_EMAIL ?? 'newsletter@kdis.ac.kr';
    this.fromName = process.env.NEWSLETTER_FROM_NAME ?? 'KDI EduPulse';
    this.logger = new Logger('mailer-agent');

    if (!this.stibeeApiKey && !this.resendApiKey) {
      this.logger.warn('No email API key configured (STIBEE_API_KEY or RESEND_API_KEY)');
    }
  }

  /**
   * 뉴스레터 발송 메인 메서드
   */
  async send(
    items: CuratedNewsItem[],
    recipients: Recipient[],
    issueNumber: number,
  ): Promise<MailerResult> {
    const errors: AgentError[] = [];

    if (items.length === 0) {
      this.logger.warn('No items to send');
      return {
        sent: false,
        recipientCount: 0,
        issueNumber,
        subject: '',
        errors: [{
          agent: AGENT_NAME,
          message: 'No items to send',
          timestamp: new Date(),
        }],
      };
    }

    if (recipients.length === 0) {
      this.logger.warn('No recipients configured');
      return {
        sent: false,
        recipientCount: 0,
        issueNumber,
        subject: '',
        errors: [{
          agent: AGENT_NAME,
          message: 'No recipients configured',
          timestamp: new Date(),
        }],
      };
    }

    // 아이템 그룹핑
    const grouped = this.groupByPriority(items);

    // 제목 생성 (필독 > 추천 > 참고 중 첫 번째 헤드라인 사용)
    const topHeadline = this.getTopHeadline(grouped);
    const subject = this.buildSubject(issueNumber, topHeadline);

    // HTML 생성
    const newsletterData: NewsletterData = {
      issueNumber,
      date: new Date().toISOString(),
      ...grouped,
    };
    const html = buildNewsletterHtml(newsletterData);

    this.logger.info(`Sending newsletter #${issueNumber} to ${recipients.length} recipients`);
    this.logger.info(`Subject: ${subject}`);

    // Stibee로 먼저 시도, 실패 시 Resend fallback
    let sent = false;

    if (this.stibeeApiKey) {
      try {
        await this.sendViaStibee(subject, html, recipients);
        sent = true;
        this.logger.info('Newsletter sent via Stibee');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Stibee failed: ${message}`);
        errors.push({
          agent: AGENT_NAME,
          message: `Stibee send failed: ${message}`,
          timestamp: new Date(),
        });
      }
    }

    if (!sent && this.resendApiKey) {
      try {
        await this.sendViaResend(subject, html, recipients);
        sent = true;
        this.logger.info('Newsletter sent via Resend (fallback)');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Resend fallback also failed: ${message}`);
        errors.push({
          agent: AGENT_NAME,
          message: `Resend fallback failed: ${message}`,
          timestamp: new Date(),
        });
      }
    }

    if (!sent && !this.stibeeApiKey && !this.resendApiKey) {
      errors.push({
        agent: AGENT_NAME,
        message: 'No email provider configured',
        timestamp: new Date(),
      });
    }

    return {
      sent,
      recipientCount: sent ? recipients.length : 0,
      issueNumber,
      subject,
      errors,
    };
  }

  /**
   * 이메일 제목 생성
   * 형식: [KDI EduPulse] #호수 - 헤드라인 (MM/DD)
   */
  buildSubject(issueNumber: number, topHeadline: string): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    // 제목이 너무 길면 잘라냄 (이메일 클라이언트 호환)
    const maxHeadlineLength = 60;
    const headline = topHeadline.length > maxHeadlineLength
      ? topHeadline.slice(0, maxHeadlineLength - 3) + '...'
      : topHeadline;

    return `[KDI EduPulse] #${issueNumber} - ${headline} (${month}/${day})`;
  }

  /**
   * Stibee API를 통한 이메일 발송
   */
  async sendViaStibee(
    subject: string,
    html: string,
    recipients: Recipient[],
  ): Promise<void> {
    if (!this.stibeeApiKey) {
      throw new Error('STIBEE_API_KEY is not configured');
    }

    await withRetry(
      async () => {
        const response = await fetch(`${STIBEE_API_BASE}/emails`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'AccessToken': this.stibeeApiKey!,
          },
          body: JSON.stringify({
            subject,
            html,
            fromEmail: this.fromEmail,
            fromName: this.fromName,
            recipients: recipients.map((r) => ({
              email: r.email,
              name: r.name,
            })),
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `Stibee API error: ${response.status} ${response.statusText} - ${body}`,
          );
        }

        return response.json();
      },
      {
        maxRetries: 3,
        baseDelay: 2000,
        agentName: AGENT_NAME,
        sourceName: 'sendViaStibee',
      },
    );
  }

  /**
   * Resend API를 통한 백업 이메일 발송
   * resend 패키지가 없을 수 있으므로 fetch로 직접 호출
   */
  async sendViaResend(
    subject: string,
    html: string,
    recipients: Recipient[],
  ): Promise<void> {
    if (!this.resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    await withRetry(
      async () => {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.resendApiKey}`,
          },
          body: JSON.stringify({
            from: `${this.fromName} <${this.fromEmail}>`,
            to: recipients.map((r) => r.email),
            subject,
            html,
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `Resend API error: ${response.status} ${response.statusText} - ${body}`,
          );
        }

        return response.json();
      },
      {
        maxRetries: 3,
        baseDelay: 2000,
        agentName: AGENT_NAME,
        sourceName: 'sendViaResend',
      },
    );
  }

  /**
   * 아이템을 priority 기준으로 그룹핑
   */
  groupByPriority(items: CuratedNewsItem[]): GroupedItems {
    const mustRead: CuratedNewsItem[] = [];
    const recommended: CuratedNewsItem[] = [];
    const reference: CuratedNewsItem[] = [];

    for (const item of items) {
      switch (item.priority) {
        case 'must-read':
          mustRead.push(item);
          break;
        case 'recommended':
          recommended.push(item);
          break;
        case 'reference':
          reference.push(item);
          break;
      }
    }

    // 각 그룹 내에서 relevanceScore 내림차순 정렬
    const sortByScore = (a: CuratedNewsItem, b: CuratedNewsItem) =>
      b.relevanceScore - a.relevanceScore;

    mustRead.sort(sortByScore);
    recommended.sort(sortByScore);
    reference.sort(sortByScore);

    return { mustRead, recommended, reference };
  }

  /**
   * 제목에 사용할 최상위 헤드라인 추출
   */
  private getTopHeadline(grouped: GroupedItems): string {
    if (grouped.mustRead.length > 0) {
      return grouped.mustRead[0].title;
    }
    if (grouped.recommended.length > 0) {
      return grouped.recommended[0].title;
    }
    if (grouped.reference.length > 0) {
      return grouped.reference[0].title;
    }
    return '이번 주 고등교육 & AI 뉴스';
  }
}
