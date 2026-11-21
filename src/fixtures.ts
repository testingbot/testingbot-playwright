import { test as base, expect } from '@playwright/test'
import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test'
import { getConnectUrl, redact, toPlaywrightBrowserName } from './capabilities'
import { findCredentials } from './credentials'
import { pageForExecutor, runExecutor, testUrl } from './executor'
import type { TestingBotProjectOptions } from './project-options'
import { MAX_REASON, outcome, testName } from './results'

export { expect }
export type { TestingBotProjectOptions }

/** Annotation type used to record the TestingBot session of a test. */
export const SESSION_ANNOTATION = 'testingbot-session'

export interface TestingBotSessionInfo {
  /** The TestingBot session id, once known (after the test). */
  sessionId?: string
  /** True when this test runs on TestingBot. */
  remote: boolean
}

export interface TestingBotTestFixtures {
  /** Information about the TestingBot session of the current test. */
  testingbotSession: TestingBotSessionInfo
}

export interface TestingBotWorkerFixtures {
  /** Set by `withTestingBot()`. Leave undefined to run a project locally. */
  testingbot: TestingBotProjectOptions | false | undefined
  _testingbotWorker: WorkerState
}

interface WorkerSession {
  browser: Browser
  results: Array<{ title: string; passed: boolean; reason?: string }>
}

interface WorkerState {
  remote?: WorkerSession
  remoteConnecting?: Promise<Browser>
  local?: Promise<Browser>
}

type PlaywrightApi = Pick<typeof import('@playwright/test'), 'chromium' | 'firefox' | 'webkit'>

async function connect(playwright: PlaywrightApi, browserName: string, wsEndpoint: string, timeout?: number): Promise<Browser> {
  const type = playwright[toPlaywrightBrowserName(browserName)]
  try {
    return await type.connect(wsEndpoint, timeout ? { timeout } : undefined)
  } catch (error) {
    const credentials = findCredentials()
    const err = error as Error
    err.message = redact(err.message, [credentials?.secret])
    throw err
  }
}

async function markSession(browser: Browser, name: string | undefined, result: { passed: boolean; reason?: string } | undefined, context?: BrowserContext): Promise<string | undefined> {
  if (!browser.isConnected()) return undefined
  const { page, cleanup } = await pageForExecutor(browser, context)
  try {
    let sessionId: string | undefined
    if (name) sessionId = (await runExecutor(page, { action: 'setSessionName', arguments: { name } }))?.sessionId
    if (result) {
      const args: Record<string, unknown> = { passed: result.passed }
      if (result.reason) args.reason = result.reason
      sessionId = (await runExecutor(page, { action: 'setSessionStatus', arguments: args }))?.sessionId ?? sessionId
    }
    if (!sessionId) sessionId = (await runExecutor(page, { action: 'getSessionDetails' }))?.sessionId
    return sessionId
  } finally {
    await cleanup()
  }
}

/**
 * Playwright Test `test` with TestingBot fixtures. Import it instead of the one
 * from `@playwright/test`:
 *
 * ```ts
 * import { test, expect } from '@testingbot/playwright'
 * ```
 *
 * In projects configured by `withTestingBot()`, each test gets its own TestingBot
 * session (named after the test) and its pass/fail status is sent to TestingBot.
 * Projects without the `testingbot` option run locally as usual.
 */
export const test = base.extend<TestingBotTestFixtures, TestingBotWorkerFixtures>({
  testingbot: [undefined, { option: true, scope: 'worker' }],

  _testingbotWorker: [
    async ({ testingbot }, use) => {
      const state: WorkerState = {}
      await use(state)
      if (state.remote) {
        const { browser, results } = state.remote
        const failed = results.filter((r) => !r.passed)
        const result = results.length === 0 ? undefined : failed.length === 0 ? { passed: true } : { passed: false, reason: failed.map((f) => `${f.title}: ${f.reason ?? 'failed'}`).join('\n').slice(0, MAX_REASON) }
        await markSession(browser, testingbot ? testingbot.name : undefined, result).catch(() => undefined)
        await browser.close().catch(() => undefined)
      }
      if (state.local) await (await state.local).close().catch(() => undefined)
    },
    { scope: 'worker', auto: true, box: true }
  ],

  testingbotSession: [
    async ({ testingbot }, use) => {
      await use({ remote: !!testingbot })
    },
    { box: true }
  ],

  context: async (
    {
      testingbot,
      _testingbotWorker,
      testingbotSession,
      playwright,
      browserName,
      headless,
      channel,
      launchOptions,
      connectOptions,
      acceptDownloads,
      bypassCSP,
      clientCertificates,
      colorScheme,
      deviceScaleFactor,
      extraHTTPHeaders,
      forcedColors,
      geolocation,
      hasTouch,
      httpCredentials,
      ignoreHTTPSErrors,
      isMobile,
      javaScriptEnabled,
      locale,
      offline,
      permissions,
      proxy,
      reducedMotion,
      screen,
      serviceWorkers,
      storageState,
      timezoneId,
      userAgent,
      viewport,
      baseURL,
      contextOptions
    },
    use,
    testInfo
  ) => {
    const explicit: BrowserContextOptions = {
      acceptDownloads,
      bypassCSP,
      clientCertificates,
      colorScheme,
      deviceScaleFactor,
      extraHTTPHeaders,
      forcedColors,
      geolocation,
      hasTouch,
      httpCredentials: httpCredentials as BrowserContextOptions['httpCredentials'],
      ignoreHTTPSErrors,
      isMobile,
      javaScriptEnabled,
      locale,
      offline,
      permissions,
      proxy,
      reducedMotion,
      screen,
      serviceWorkers,
      storageState,
      timezoneId,
      userAgent,
      viewport,
      baseURL
    }
    const options: BrowserContextOptions = { ...contextOptions }
    for (const [key, value] of Object.entries(explicit)) {
      if (value !== undefined) (options as Record<string, unknown>)[key] = value
    }

    // Local project: behave like Playwright Test, one browser per worker.
    if (!testingbot) {
      if (!_testingbotWorker.local) {
        _testingbotWorker.local = connectOptions
          ? playwright[browserName].connect(connectOptions.wsEndpoint, connectOptions)
          : playwright[browserName].launch({ headless, channel, ...launchOptions })
      }
      const context = await (await _testingbotWorker.local).newContext(options)
      await use(context)
      await context.close().catch(() => undefined)
      return
    }

    const browserType = testingbot.browserName ?? 'chrome'

    // One TestingBot session per worker (sessionPerTest: false).
    if (testingbot.sessionPerTest === false) {
      if (!_testingbotWorker.remote) {
        const started = Date.now()
        _testingbotWorker.remoteConnecting ??= connect(playwright, browserType, getConnectUrl({ ...testingbot, name: testingbot.name ?? `${testInfo.project.name} (worker ${testInfo.parallelIndex})` }))
        const browser = await _testingbotWorker.remoteConnecting
        _testingbotWorker.remote ??= { browser, results: [] }
        testInfo.setTimeout(testInfo.timeout + (Date.now() - started))
      }
      const session = _testingbotWorker.remote
      const context = await session.browser.newContext(options)
      await use(context)
      const result = outcome(testInfo)
      if (result) session.results.push({ title: testInfo.title, ...result })
      if (!testingbotSession.sessionId) {
        testingbotSession.sessionId = await markSession(session.browser, undefined, undefined, context).catch(() => undefined)
      }
      if (testingbotSession.sessionId) testInfo.annotations.push({ type: SESSION_ANNOTATION, description: testUrl(testingbotSession.sessionId) })
      await context.close().catch(() => undefined)
      return
    }

    // One TestingBot session per test (default).
    const name = testName(testInfo, testingbot)
    const started = Date.now()
    const browser = await connect(playwright, browserType, getConnectUrl({ ...testingbot, name }))
    // Waiting for a free TestingBot session should not count against the test timeout.
    testInfo.setTimeout(testInfo.timeout + (Date.now() - started))
    const context = await browser.newContext(options)
    try {
      await use(context)
    } finally {
      try {
        const sessionId = await markSession(browser, undefined, outcome(testInfo), context)
        if (sessionId) {
          testingbotSession.sessionId = sessionId
          testInfo.annotations.push({ type: SESSION_ANNOTATION, description: testUrl(sessionId) })
        }
      } catch {
        // The browser may have crashed or disconnected; nothing left to report through.
      }
      await context.close().catch(() => undefined)
      await browser.close().catch(() => undefined)
    }
  }
})
