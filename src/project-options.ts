import type { BrowserSpec, SessionOptions } from './capabilities'

/**
 * The `testingbot` option that {@link withTestingBot} puts in each project's `use`
 * block. It contains no credentials: they are read in each worker from the
 * environment or `~/.testingbot`.
 */
export interface TestingBotProjectOptions extends BrowserSpec, SessionOptions {
  /**
   * `true` (default): every test runs in its own TestingBot session, named after the test,
   * with its own pass/fail status. `false`: one session per worker, the way Playwright
   * Test reuses a browser, marked failed when any test in that worker failed.
   */
  sessionPerTest?: boolean
  /** WebSocket endpoint, defaults to `wss://cloud.testingbot.com/playwright`. */
  endpoint?: string
}
