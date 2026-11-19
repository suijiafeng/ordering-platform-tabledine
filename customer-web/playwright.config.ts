import { defineConfig } from '@playwright/test'

// 与 `next dev` 一致：未设置 PORT 时用 3000，设置了就跟顾客端开发服务器走同一个端口
const portFromEnv = process.env.PORT ?? ''
const port = /^\d+$/.test(portFromEnv) ? portFromEnv : '3000'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // 可复用本机 Chromium；不设置时使用 Playwright 安装的浏览器。
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/h5/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
