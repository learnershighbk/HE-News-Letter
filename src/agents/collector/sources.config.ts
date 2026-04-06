import { NewsSource } from '../../shared/types.js';

/**
 * 뉴스 수집 소스 설정
 * PRD 3.2.1 기반 16개 소스 정의
 */
export const newsSources: NewsSource[] = [
  // ── 고등교육 정책 (EN) ──
  {
    name: 'Times Higher Education',
    url: 'https://www.timeshighereducation.com',
    method: 'rss',
    language: 'en',
    category: '국제화 & 랭킹',
    rssUrl: 'https://www.timeshighereducation.com/rss',
    enabled: true,
  },
  {
    name: 'Inside Higher Ed',
    url: 'https://www.insidehighered.com',
    method: 'rss',
    language: 'en',
    category: '정책 & 거버넌스',
    rssUrl: 'https://www.insidehighered.com/feed',
    enabled: true,
  },
  {
    name: 'Chronicle of Higher Education',
    url: 'https://www.chronicle.com',
    method: 'rss',
    language: 'en',
    category: '정책 & 거버넌스',
    rssUrl: 'https://www.chronicle.com/feed',
    enabled: true,
  },
  {
    name: 'University World News',
    url: 'https://www.universityworldnews.com',
    method: 'rss',
    language: 'en',
    category: '국제화 & 랭킹',
    rssUrl: 'https://www.universityworldnews.com/rss.php',
    enabled: true,
  },

  // ── AI in Education (EN) ──
  {
    name: 'EDUCAUSE Review',
    url: 'https://er.educause.edu',
    method: 'rss',
    language: 'en',
    category: '교육혁신 & 테크',
    rssUrl: 'https://er.educause.edu/rss',
    enabled: true,
  },
  {
    name: 'MIT OpenCourseWare Blog',
    url: 'https://ocw.mit.edu',
    method: 'rss',
    language: 'en',
    category: '교육혁신 & 테크',
    rssUrl: 'https://ocw.mit.edu/rss/new',
    enabled: true,
  },
  {
    name: 'Stanford HAI',
    url: 'https://hai.stanford.edu',
    method: 'scraping',
    language: 'en',
    category: 'AI 윤리 & 가이드라인',
    selectors: {
      articleList: '.news-listing .news-item',
      title: 'h3 a',
      link: 'h3 a',
      date: '.date',
      content: '.summary',
    },
    enabled: true,
  },

  // ── 한국 고등교육 (KO) ──
  {
    name: '한국대학교육협의회',
    url: 'https://www.kcue.or.kr',
    method: 'scraping',
    language: 'ko',
    category: '정책 & 거버넌스',
    selectors: {
      articleList: '.board_list tbody tr',
      title: 'td.title a',
      link: 'td.title a',
      date: 'td.date',
    },
    enabled: true,
  },
  {
    name: '교육부 보도자료',
    url: 'https://www.moe.go.kr',
    method: 'scraping',
    language: 'ko',
    category: '정책 & 거버넌스',
    selectors: {
      articleList: '.board_list tbody tr',
      title: 'td.subject a',
      link: 'td.subject a',
      date: 'td.date',
    },
    enabled: true,
  },
  {
    name: '대학지성IN',
    url: 'https://www.unipress.co.kr',
    method: 'rss',
    language: 'ko',
    category: '정책 & 거버넌스',
    rssUrl: 'https://www.unipress.co.kr/rss/allArticle.xml',
    enabled: true,
  },
  {
    name: '한국대학신문',
    url: 'https://news.unn.net',
    method: 'rss',
    language: 'ko',
    category: '정책 & 거버넌스',
    rssUrl: 'https://news.unn.net/rss/allArticle.xml',
    enabled: true,
  },

  // ── AI 업계 동향 (EN) ──
  {
    name: 'Anthropic Blog',
    url: 'https://www.anthropic.com/blog',
    method: 'rss',
    language: 'en',
    category: '교육혁신 & 테크',
    rssUrl: 'https://www.anthropic.com/rss.xml',
    enabled: true,
  },
  {
    name: 'OpenAI Blog',
    url: 'https://openai.com/blog',
    method: 'rss',
    language: 'en',
    category: '교육혁신 & 테크',
    rssUrl: 'https://openai.com/blog/rss.xml',
    enabled: true,
  },
  {
    name: 'Google AI Blog',
    url: 'https://blog.google/technology/ai',
    method: 'rss',
    language: 'en',
    category: '교육혁신 & 테크',
    rssUrl: 'https://blog.google/technology/ai/rss/',
    enabled: true,
  },

  // ── 정책/거버넌스 (EN) ──
  {
    name: 'OECD Education GPS',
    url: 'https://gpseducation.oecd.org',
    method: 'rss',
    language: 'en',
    category: '정책 & 거버넌스',
    rssUrl: 'https://gpseducation.oecd.org/rss',
    enabled: true,
  },
  {
    name: 'World Bank EdTech',
    url: 'https://www.worldbank.org/en/topic/edutech',
    method: 'rss',
    language: 'en',
    category: '교육혁신 & 테크',
    rssUrl: 'https://blogs.worldbank.org/edutech/rss.xml',
    enabled: true,
  },
];
