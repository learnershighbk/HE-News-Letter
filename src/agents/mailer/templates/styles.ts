// ============================================================
// Mailer Agent - Inline CSS Styles for Email Newsletter
// KDI School 브랜딩 컬러: #003366 (navy)
// 이메일 호환성을 위해 모든 스타일은 인라인으로 적용
// ============================================================

export const STYLES = {
  body: `
    margin: 0;
    padding: 0;
    background-color: #f4f6f8;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #333333;
    line-height: 1.6;
  `.trim().replace(/\n\s+/g, ' '),

  container: `
    max-width: 640px;
    margin: 0 auto;
    background-color: #ffffff;
    border: 1px solid #e0e0e0;
  `.trim().replace(/\n\s+/g, ' '),

  header: `
    background-color: #003366;
    color: #ffffff;
    padding: 24px 32px;
    text-align: center;
  `.trim().replace(/\n\s+/g, ' '),

  headerTitle: `
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: -0.5px;
  `.trim().replace(/\n\s+/g, ' '),

  headerSubtitle: `
    margin: 8px 0 0 0;
    font-size: 13px;
    color: #a8c4e0;
    font-weight: 400;
  `.trim().replace(/\n\s+/g, ' '),

  greeting: `
    padding: 24px 32px 16px 32px;
    font-size: 14px;
    color: #555555;
    line-height: 1.7;
  `.trim().replace(/\n\s+/g, ' '),

  sectionTitle: `
    font-size: 16px;
    font-weight: 700;
    color: #003366;
    margin: 0 0 16px 0;
    padding: 24px 32px 0 32px;
    border-top: 2px solid #f0f0f0;
  `.trim().replace(/\n\s+/g, ' '),

  mustReadCard: `
    margin: 0 32px 16px 32px;
    padding: 16px 20px;
    background-color: #fff8f0;
    border-left: 4px solid #e67e22;
    border-radius: 4px;
  `.trim().replace(/\n\s+/g, ' '),

  recommendedItem: `
    margin: 0 32px 16px 32px;
    padding: 16px 20px;
    background-color: #f8fbff;
    border-left: 4px solid #3498db;
    border-radius: 4px;
  `.trim().replace(/\n\s+/g, ' '),

  referenceItem: `
    margin: 0 32px 12px 32px;
    padding: 12px 20px;
    background-color: #f9f9f9;
    border-left: 4px solid #95a5a6;
    border-radius: 4px;
  `.trim().replace(/\n\s+/g, ' '),

  categoryBadge: `
    display: inline-block;
    font-size: 11px;
    color: #003366;
    background-color: #e8f0fe;
    padding: 2px 8px;
    border-radius: 12px;
    margin-right: 6px;
    margin-bottom: 6px;
  `.trim().replace(/\n\s+/g, ' '),

  itemTitle: `
    margin: 8px 0 4px 0;
    font-size: 15px;
    font-weight: 600;
    color: #222222;
    line-height: 1.4;
  `.trim().replace(/\n\s+/g, ' '),

  itemSource: `
    font-size: 12px;
    color: #888888;
    margin: 0 0 8px 0;
  `.trim().replace(/\n\s+/g, ' '),

  insight: `
    font-size: 13px;
    color: #555555;
    margin: 8px 0 0 0;
    padding: 8px 12px;
    background-color: rgba(0, 51, 102, 0.04);
    border-radius: 4px;
    line-height: 1.6;
  `.trim().replace(/\n\s+/g, ' '),

  link: `
    color: #003366;
    text-decoration: none;
    font-weight: 500;
  `.trim().replace(/\n\s+/g, ' '),

  readMore: `
    display: inline-block;
    margin-top: 8px;
    font-size: 13px;
    color: #003366;
    text-decoration: none;
    font-weight: 600;
  `.trim().replace(/\n\s+/g, ' '),

  footer: `
    padding: 24px 32px;
    text-align: center;
    font-size: 12px;
    color: #999999;
    background-color: #f8f9fa;
    border-top: 1px solid #e0e0e0;
    line-height: 1.8;
  `.trim().replace(/\n\s+/g, ' '),

  footerLink: `
    color: #003366;
    text-decoration: none;
  `.trim().replace(/\n\s+/g, ' '),

  divider: `
    border: none;
    border-top: 1px solid #f0f0f0;
    margin: 0 32px;
  `.trim().replace(/\n\s+/g, ' '),
} as const;
