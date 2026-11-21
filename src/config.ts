import * as path from 'node:path'
import type { PlaywrightTestConfig, Project, ReporterDescription } from '@playwright/test'
import { describeBrowser, getConnectUrl, toPlaywrightBrowserName, toTestingBotBrowserName, type BrowserSpec, type SessionOptions } from './capabilities'
import type { CredentialOptions } from './credentials'
import { TUNNEL_IDENTIFIER_ENV, type TestingBotMetadata } from './global-setup'
import type { TestingBotProjectOptions } from './project-options'
import type { TestingBotReporterOptions } from './reporter'
import { generateTunnelIdentifier, type TunnelOptions } from './tunnel'

export const BUILD_ENV = 'TESTINGBOT_PLAYWRIGHT_BUILD'

export interface BrowserProject extends BrowserSpec {
  /** Project name. Defaults to a label such as `chrome@latest:WIN11`. */
  name?: string
  /** Extra `tb:options` for this browser only. */
  tbOptions?: Record<string, unknown>
  /** Extra Playwright `use` options for this project. */
  use?: Project['use']
}

export interface WithTestingBotOptions extends Omit<SessionOptions, 'tunnelIdentifier' | 'build'>, Pick<CredentialOptions, 'env'> {
  /**
   * Browsers to run on. Each becomes a project (or, when the config already has projects,
   * each project is run on each browser). Omit to convert the existing projects, using their
   * `browserName` / `channel`, or to run on the latest Chrome when there are none.
   */
  browsers?: BrowserProject[]
  /**
   * Build name that groups this run in the dashboard. Defaults to `TESTINGBOT_BUILD`, or to
   * a generated `playwright <date>` name. `false` sends no build.
   */
  build?: string | false
  /**
   * Start a TestingBot Tunnel before the run and stop it afterwards. `true` uses a generated
   * identifier; pass `testingbot-tunnel-launcher` options to configure it, or `{ tunnelIdentifier }`
   * with `start: false` to use a tunnel you started yourself.
   */
  tunnel?: boolean | (TunnelOptions & { start?: boolean })
  /** One session per test (default) or one per worker. See {@link TestingBotProjectOptions.sessionPerTest}. */
  sessionPerTest?: boolean
  /** Add the TestingBot reporter, which prints a link to each test's session. Default `true`. */
  reporter?: boolean | TestingBotReporterOptions
  /** WebSocket endpoint, defaults to `wss://cloud.testingbot.com/playwright`. */
  endpoint?: string
}

function defaultBuildName(): string {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  return `playwright ${stamp}`
}

/** Reads a value from the environment, or generates it once and stores it so worker processes see the same value. */
function stable(env: NodeJS.ProcessEnv, name: string, generate: () => string): string {
  const existing = env[name]
  if (existing) return existing
  const value = generate()
  env[name] = value
  return value
}

/** Works out which TestingBot browser a Playwright project targets. */
export function browserForProject(project: Project): BrowserSpec {
  const use = (project.use ?? {}) as Record<string, unknown>
  const channel = typeof use.channel === 'string' ? use.channel : undefined
  const browserName = (use.browserName ?? use.defaultBrowserType ?? 'chromium') as string
  let name: string
  if (browserName === 'chromium') name = channel?.startsWith('msedge') ? 'edge' : 'chrome'
  else name = toTestingBotBrowserName(browserName)
  return { browserName: name }
}

function toReporterList(reporter: PlaywrightTestConfig['reporter']): ReporterDescription[] {
  if (!reporter) return [[process.env.CI ? 'dot' : 'list']]
  if (typeof reporter === 'string') return [[reporter]]
  return [...reporter] as ReporterDescription[]
}

function toList(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Makes the projects of a Playwright config run on TestingBot.
 *
 * ```ts
 * // playwright.config.ts
 * import { defineConfig } from '@playwright/test'
 * import { withTestingBot } from '@testingbot/playwright'
 *
 * export default withTestingBot(defineConfig({ testDir: './tests' }), {
 *   browsers: [
 *     { browserName: 'chrome', browserVersion: 'latest', platform: 'WIN11' },
 *     { browserName: 'firefox', platform: 'LINUX' }
 *   ],
 *   tunnel: true
 * })
 * ```
 *
 * A project that sets `use: { testingbot: false }` is left alone and runs locally.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function withTestingBot<T = {}, W = {}>(config: PlaywrightTestConfig<T, W>, options: WithTestingBotOptions = {}): PlaywrightTestConfig<T, W> {
  const env = options.env ?? process.env

  const build =
    options.build === false ? undefined : (options.build ?? env.TESTINGBOT_BUILD ?? stable(env, BUILD_ENV, () => defaultBuildName()))

  let tunnelIdentifier: string | undefined
  let tunnelMetadata: TestingBotMetadata['tunnel'] = false
  if (options.tunnel) {
    const { start = true, ...tunnelOptions } = options.tunnel === true ? {} : options.tunnel
    // Playwright browsers do not trust the tunnel's SSL-bumping CA, so HTTPS sites would fail
    // with ERR_CERT_AUTHORITY_INVALID. Forward HTTPS untouched unless asked otherwise.
    if (tunnelOptions.noBump === undefined) tunnelOptions.noBump = true
    tunnelIdentifier = (tunnelOptions.tunnelIdentifier as string | undefined) ?? stable(env, TUNNEL_IDENTIFIER_ENV, () => generateTunnelIdentifier())
    if (start) tunnelMetadata = { ...tunnelOptions, tunnelIdentifier }
  }

  const sessionDefaults: TestingBotProjectOptions = {
    name: options.name,
    build,
    tunnelIdentifier,
    tbOptions: options.tbOptions,
    capabilities: options.capabilities,
    sessionPerTest: options.sessionPerTest,
    endpoint: options.endpoint
  }

  const configure = (project: Project, spec: BrowserSpec & { tbOptions?: Record<string, unknown> }, extraUse?: Project['use']): Project => {
    const use = { ...(project.use ?? {}), ...(extraUse ?? {}) } as Record<string, unknown>
    const testingbot: TestingBotProjectOptions = JSON.parse(
      JSON.stringify({
        ...sessionDefaults,
        browserName: toTestingBotBrowserName(spec.browserName),
        browserVersion: spec.browserVersion ?? 'latest',
        platform: spec.platform,
        tbOptions: { ...(sessionDefaults.tbOptions ?? {}), ...(spec.tbOptions ?? {}) }
      })
    )
    return {
      ...project,
      use: {
        ...use,
        browserName: toPlaywrightBrowserName(spec.browserName),
        // Used by the `browser` fixture of plain `@playwright/test` (one session per worker).
        connectOptions: { wsEndpoint: getConnectUrl({ ...testingbot, name: testingbot.name ?? project.name, env }) },
        testingbot
      } as Project['use']
    }
  }

  const existing = (config.projects ?? []) as unknown as Project[]
  let projects: Project[]
  if (options.browsers && options.browsers.length > 0) {
    const browsers = options.browsers.map((b) => ({ ...b, label: b.name ?? describeBrowser(b) }))
    if (existing.length === 0) {
      projects = browsers.map((b) => configure({ name: b.label }, b, b.use))
    } else {
      projects = []
      for (const project of existing) {
        if ((project.use as Record<string, unknown> | undefined)?.testingbot === false) {
          projects.push(project)
          continue
        }
        for (const b of browsers) {
          const name = project.name ? `${project.name} ${b.label}` : b.label
          const dependencies = project.dependencies?.map((d) => {
            const dep = existing.find((p) => p.name === d)
            return dep && (dep.use as Record<string, unknown> | undefined)?.testingbot !== false ? `${d} ${b.label}` : d
          })
          projects.push(configure({ ...project, name, dependencies }, b, b.use))
        }
      }
    }
  } else if (existing.length > 0) {
    projects = existing.map((project) => {
      const use = (project.use ?? {}) as Record<string, unknown>
      if (use.testingbot === false) return project
      const spec = (typeof use.testingbot === 'object' && use.testingbot ? use.testingbot : browserForProject(project)) as BrowserSpec
      return configure(project, spec)
    })
  } else {
    projects = [configure({ name: describeBrowser({ browserName: 'chrome' }) }, { browserName: 'chrome' })]
  }

  const result = { ...config, projects } as unknown as PlaywrightTestConfig
  result.metadata = { ...(config.metadata ?? {}), testingbot: { tunnel: tunnelMetadata, build } satisfies TestingBotMetadata }

  if (tunnelMetadata) {
    result.globalSetup = [path.join(__dirname, 'global-setup.js'), ...toList(config.globalSetup as string | string[] | undefined)]
  }

  if (options.reporter !== false) {
    const reporterOptions = typeof options.reporter === 'object' ? options.reporter : {}
    result.reporter = [...toReporterList(config.reporter), [path.join(__dirname, 'reporter.js'), reporterOptions]]
  }

  return result as PlaywrightTestConfig<T, W>
}

/**
 * Same as `withTestingBot(config, options)`, for use as the default export of `playwright.config`:
 *
 * ```ts
 * export default defineConfig({ testDir: './tests' }, { browsers: [{ browserName: 'chrome' }] })
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function defineConfig<T = {}, W = {}>(config: PlaywrightTestConfig<T, W>, options: WithTestingBotOptions = {}): PlaywrightTestConfig<T, W> {
  return withTestingBot(config, options)
}
