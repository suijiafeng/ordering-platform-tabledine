import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
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
    command: 'npm run dev -- --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3000/h5/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
