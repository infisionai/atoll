import { defineConfig } from 'vitepress'

// Sidebar is defined per locale; MVP keeps a single tree shared by every section.
const enSidebar = [
  {
    text: 'Getting Started',
    items: [
      { text: 'Install on macOS', link: '/getting-started/install-macos' },
      { text: 'Install on Windows', link: '/getting-started/install-windows' },
      { text: 'Your first workflow', link: '/getting-started/first-workflow' },
    ],
  },
  {
    text: 'Core Concepts',
    items: [{ text: 'Overview', link: '/concepts/' }],
  },
  {
    text: 'Providers',
    items: [
      { text: 'Provider overview', link: '/providers/' },
      { text: 'Connect Higgsfield', link: '/providers/higgsfield' },
      { text: 'Connect Magnific', link: '/providers/magnific' },
      { text: 'Connect Kling', link: '/providers/kling' },
    ],
  },
  {
    text: 'Agents',
    items: [{ text: 'Agent terminal', link: '/agents/terminal' }],
  },
  {
    text: 'Reference',
    items: [{ text: 'Canvas MCP tools', link: '/reference/mcp-tools' }],
  },
  {
    text: 'Help',
    items: [{ text: 'Troubleshooting', link: '/help/troubleshooting' }],
  },
]

const koSidebar = [
  {
    text: '시작하기',
    items: [
      { text: 'macOS 설치', link: '/ko/getting-started/install-macos' },
      { text: 'Windows 설치', link: '/ko/getting-started/install-windows' },
      { text: '첫 워크플로', link: '/ko/getting-started/first-workflow' },
    ],
  },
  {
    text: '핵심 개념',
    items: [{ text: '개요', link: '/ko/concepts/' }],
  },
  {
    text: 'Provider',
    items: [
      { text: 'Provider 개요', link: '/ko/providers/' },
      { text: 'Higgsfield 연결', link: '/ko/providers/higgsfield' },
      { text: 'Magnific 연결', link: '/ko/providers/magnific' },
      { text: 'Kling 연결', link: '/ko/providers/kling' },
    ],
  },
  {
    text: '에이전트',
    items: [{ text: '에이전트 터미널', link: '/ko/agents/terminal' }],
  },
  {
    text: '레퍼런스',
    items: [{ text: '캔버스 MCP 도구', link: '/ko/reference/mcp-tools' }],
  },
  {
    text: '도움말',
    items: [{ text: '문제 해결', link: '/ko/help/troubleshooting' }],
  },
]

export default defineConfig({
  title: 'Atoll',
  description:
    'A canvas-based desktop app that wires AI generation providers into one workflow — with an agent terminal inside.',
  base: '/atoll/',
  cleanUrls: true,
  lastUpdated: true,
  // Deep-sea control room: dark is the native habitat
  appearance: 'dark',
  // Trailing slash keeps the /atoll/ base in generated sitemap URLs
  sitemap: { hostname: 'https://infisionai.github.io/atoll/' },

  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/atoll/favicon.svg' }]],

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/getting-started/first-workflow' },
          { text: 'Providers', link: '/providers/' },
          { text: 'Reference', link: '/reference/mcp-tools' },
          {
            text: 'Download',
            link: 'https://github.com/infisionai/atoll/releases',
          },
        ],
        sidebar: enSidebar,
      },
    },
    ko: {
      label: '한국어',
      lang: 'ko',
      link: '/ko/',
      themeConfig: {
        nav: [
          { text: '가이드', link: '/ko/getting-started/first-workflow' },
          { text: 'Provider', link: '/ko/providers/' },
          { text: '레퍼런스', link: '/ko/reference/mcp-tools' },
          {
            text: '다운로드',
            link: 'https://github.com/infisionai/atoll/releases',
          },
        ],
        sidebar: koSidebar,
        outline: { label: '이 페이지에서' },
        docFooter: { prev: '이전', next: '다음' },
        lastUpdated: { text: '마지막 업데이트' },
        returnToTopLabel: '맨 위로',
        sidebarMenuLabel: '메뉴',
        darkModeSwitchLabel: '테마',
        editLink: {
          pattern: 'https://github.com/infisionai/atoll/edit/main/docs/:path',
          text: 'GitHub에서 이 페이지 수정',
        },
      },
    },
  },

  themeConfig: {
    logo: '/favicon.svg',
    socialLinks: [{ icon: 'github', link: 'https://github.com/infisionai/atoll' }],
    editLink: {
      pattern: 'https://github.com/infisionai/atoll/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: '© Atoll contributors',
    },
    search: {
      provider: 'local',
      options: {
        locales: {
          ko: {
            translations: {
              button: { buttonText: '검색', buttonAriaLabel: '검색' },
              modal: {
                noResultsText: '결과 없음',
                resetButtonTitle: '초기화',
                footer: { selectText: '선택', navigateText: '이동', closeText: '닫기' },
              },
            },
          },
        },
      },
    },
  },
})
