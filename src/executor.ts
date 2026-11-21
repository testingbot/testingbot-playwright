import type { Browser, BrowserContext, Page } from '@playwright/test'

export interface ExecutorCommand {
  action: 'setSessionName' | 'setSessionStatus' | 'getSessionDetails' | (string & {})
  arguments?: Record<string, unknown>
}

export interface ExecutorResult {
  sessionId?: string
  [key: string]: unknown
}

/** Sends a `testingbot_executor` command through a page of a TestingBot Playwright session. */
export async function runExecutor(page: Page, command: ExecutorCommand): Promise<ExecutorResult | undefined> {
  const script = `testingbot_executor: ${JSON.stringify(command)}`
  const result = await page.evaluate(() => {}, script as unknown as never)
  return (result ?? undefined) as ExecutorResult | undefined
}

/** Finds an open page in the browser (or creates one) to send executor commands through. */
export async function pageForExecutor(browser: Browser, context?: BrowserContext): Promise<{ page: Page; cleanup: () => Promise<void> }> {
  const contexts = context ? [context, ...browser.contexts()] : browser.contexts()
  for (const ctx of contexts) {
    const open = ctx.pages().find((p) => !p.isClosed())
    if (open) return { page: open, cleanup: async () => {} }
  }
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  return { page, cleanup: () => ctx.close().catch(() => {}) }
}

/** Removes ANSI colour codes, which Playwright error messages contain. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

export function testUrl(sessionId: string): string {
  return `https://testingbot.com/members/tests/${sessionId}`
}
