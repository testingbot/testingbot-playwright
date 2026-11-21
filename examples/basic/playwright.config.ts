import { defineConfig } from '@playwright/test'
import { withTestingBot } from '@testingbot/playwright'

export default withTestingBot(
  defineConfig({
    testDir: './tests',
    timeout: 60_000,
    workers: 2,
    use: { baseURL: 'http://localhost:3999' },
    webServer: { command: 'node server.js', url: 'http://localhost:3999', reuseExistingServer: true }
  }),
  {
    browsers: [{ browserName: 'chrome', platform: 'LINUX' }],
    tunnel: true,
    reporter: { outputFile: 'testingbot-sessions.json' }
  }
)
