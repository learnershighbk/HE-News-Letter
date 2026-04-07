// ============================================================
// Mailer Agent - HTML Newsletter Builder
// table 레이아웃 + 인라인 CSS (이메일 클라이언트 호환)
// 섹션: Header → 인사말 → 필독(🔥) → 추천(⭐) → 참고(📌) → Footer
// ============================================================

import type { CuratedNewsItem } from '../../../shared/types.js';
import { STYLES } from './styles.js';

// --- Types ---

export interface NewsletterData {
  issueNumber: number;
  date: string;
  mustRead: CuratedNewsItem[];
  recommended: CuratedNewsItem[];
  reference: CuratedNewsItem[];
}

// --- Helpers ---

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

function formatPublishedDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

// --- Card Renderers ---

function renderCategories(categories: string[]): string {
  return categories
    .map((cat) => `<span style="${STYLES.categoryBadge}">${escapeHtml(cat)}</span>`)
    .join('');
}

function renderMustReadCard(item: CuratedNewsItem): string {
  return `
    <div style="${STYLES.mustReadCard}">
      <div>${renderCategories(item.categories)}</div>
      <h3 style="${STYLES.itemTitle}">
        <a href="${escapeHtml(item.url)}" style="${STYLES.link}" target="_blank">
          ${escapeHtml(item.title)}
        </a>
      </h3>
      <p style="${STYLES.itemSource}">${escapeHtml(item.source)} | ${formatPublishedDate(item.publishedAt)}</p>
      <p style="margin: 0; font-size: 14px; color: #444; line-height: 1.6;">
        ${escapeHtml(item.summaryKo)}
      </p>
      <div style="${STYLES.insight}">
        💡 <strong>KDI Insight:</strong> ${escapeHtml(item.kdiInsight)}
      </div>
      <a href="${escapeHtml(item.url)}" style="${STYLES.readMore}" target="_blank">원문 읽기 →</a>
    </div>
  `;
}

function renderRecommendedCard(item: CuratedNewsItem): string {
  return `
    <div style="${STYLES.recommendedItem}">
      <div>${renderCategories(item.categories)}</div>
      <h3 style="${STYLES.itemTitle}">
        <a href="${escapeHtml(item.url)}" style="${STYLES.link}" target="_blank">
          ${escapeHtml(item.title)}
        </a>
      </h3>
      <p style="${STYLES.itemSource}">${escapeHtml(item.source)} | ${formatPublishedDate(item.publishedAt)}</p>
      <p style="margin: 0; font-size: 13px; color: #555; line-height: 1.6;">
        ${escapeHtml(item.summaryKo)}
      </p>
      <a href="${escapeHtml(item.url)}" style="${STYLES.readMore}" target="_blank">원문 읽기 →</a>
    </div>
  `;
}

function renderReferenceCard(item: CuratedNewsItem): string {
  return `
    <div style="${STYLES.referenceItem}">
      <div>${renderCategories(item.categories)}</div>
      <h3 style="margin: 4px 0; font-size: 14px; font-weight: 600; color: #333; line-height: 1.4;">
        <a href="${escapeHtml(item.url)}" style="${STYLES.link}" target="_blank">
          ${escapeHtml(item.title)}
        </a>
      </h3>
      <p style="${STYLES.itemSource}">${escapeHtml(item.source)} | ${formatPublishedDate(item.publishedAt)}</p>
    </div>
  `;
}

// --- Section Renderers ---

function renderMustReadSection(items: CuratedNewsItem[]): string {
  if (items.length === 0) return '';
  return `
    <h2 style="${STYLES.sectionTitle}">🔥 필독 (Must-Read)</h2>
    ${items.map(renderMustReadCard).join('')}
  `;
}

function renderRecommendedSection(items: CuratedNewsItem[]): string {
  if (items.length === 0) return '';
  return `
    <h2 style="${STYLES.sectionTitle}">⭐ 추천 (Recommended)</h2>
    ${items.map(renderRecommendedCard).join('')}
  `;
}

function renderReferenceSection(items: CuratedNewsItem[]): string {
  if (items.length === 0) return '';
  return `
    <h2 style="${STYLES.sectionTitle}">📌 참고 (Reference)</h2>
    ${items.map(renderReferenceCard).join('')}
  `;
}

// --- Main Builder ---

export function buildNewsletterHtml(data: NewsletterData): string {
  const { issueNumber, date, mustRead, recommended, reference } = data;
  const formattedDate = formatDate(date);
  const totalCount = mustRead.length + recommended.length + reference.length;

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KDI EduPulse #${issueNumber}</title>
</head>
<body style="${STYLES.body}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f6f8;">
    <tr>
      <td align="center" style="padding: 20px 10px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="${STYLES.container}">
          <!-- Header -->
          <tr>
            <td style="${STYLES.header}">
              <h1 style="${STYLES.headerTitle}">KDI EduPulse</h1>
              <p style="${STYLES.headerSubtitle}">고등교육 & AI 뉴스 큐레이션 | #${issueNumber} (${formattedDate})</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="${STYLES.greeting}">
              안녕하세요, KDI대학원 구성원 여러분!<br>
              이번 주 고등교육 및 AI 관련 주요 뉴스 <strong>${totalCount}건</strong>을 선별하여 전달드립니다.
            </td>
          </tr>

          <!-- Must-Read Section -->
          <tr>
            <td>
              ${renderMustReadSection(mustRead)}
            </td>
          </tr>

          <!-- Recommended Section -->
          <tr>
            <td>
              ${renderRecommendedSection(recommended)}
            </td>
          </tr>

          <!-- Reference Section -->
          <tr>
            <td>
              ${renderReferenceSection(reference)}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="${STYLES.footer}">
              <p style="margin: 0 0 8px 0;">
                <strong>KDI EduPulse</strong> - KDI School 고등교육 & AI 뉴스 큐레이션
              </p>
              <p style="margin: 0;">
                본 뉴스레터는 AI가 자동 큐레이션한 콘텐츠입니다.<br>
                KDI School of Public Policy and Management
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
