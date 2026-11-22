import { getCredentials, type CredentialOptions } from './credentials'

export const DEFAULT_ENDPOINT = 'wss://cloud.testingbot.com/playwright'

/** Browser names TestingBot accepts for Playwright. `safari` is accepted as an alias of `webkit`. */
export type TestingBotBrowserName = 'chrome' | 'edge' | 'firefox' | 'webkit' | 'safari' | (string & {})

/** The Playwright browser type (`chromium`, `firefox`, `webkit`) used to connect. */
export type PlaywrightBrowserName = 'chromium' | 'firefox' | 'webkit'

export interface BrowserSpec {
  /** `chrome`, `edge`, `firefox` or `webkit` (Safari). Defaults to `chrome`. */
  browserName?: TestingBotBrowserName
  /** A version number, `latest` or `latest-N`. Defaults to `latest`. */
  browserVersion?: string
  /** For example `WIN11`, `WIN10`, `SEQUOIA`, `TAHOE` or `LINUX`. TestingBot picks one when omitted. */
  platform?: string
}

export interface SessionOptions {
  /** Test name shown in the TestingBot dashboard. */
  name?: string
  /** Groups tests into a build in the TestingBot dashboard. */
  build?: string
  /** Route this session through the TestingBot Tunnel that was started with this identifier. */
  tunnelIdentifier?: string
  /** Extra `tb:options` (for example `screenrecorder`, `timeZone`, `deviceName`, `realDevice`). */
  tbOptions?: Record<string, unknown>
  /** Extra top-level capabilities. */
  capabilities?: Record<string, unknown>
}

export interface ConnectUrlOptions extends BrowserSpec, SessionOptions, CredentialOptions {
  /** Defaults to `wss://cloud.testingbot.com/playwright` (or `TESTINGBOT_PLAYWRIGHT_ENDPOINT`). */
  endpoint?: string
}

export interface TestingBotCapabilities {
  browserName: string
  browserVersion: string
  platform?: string
  'tb:options': Record<string, unknown>
  [capability: string]: unknown
}

/** Normalises user input to the browser name TestingBot expects. */
export function toTestingBotBrowserName(browserName: string | undefined): string {
  const name = (browserName ?? 'chrome').toLowerCase()
  switch (name) {
    case 'chromium':
    case 'googlechrome':
    case 'chrome':
      return 'chrome'
    case 'msedge':
    case 'microsoftedge':
    case 'edge':
      return 'edge'
    case 'safari':
    case 'webkit':
      return 'webkit'
    case 'firefox':
      return 'firefox'
    default:
      return name
  }
}

/** The Playwright browser type to connect with for a TestingBot browser name. */
export function toPlaywrightBrowserName(browserName: string | undefined): PlaywrightBrowserName {
  const name = toTestingBotBrowserName(browserName)
  if (name === 'firefox') return 'firefox'
  if (name === 'webkit') return 'webkit'
  return 'chromium'
}

function compact<T extends Record<string, unknown>>(object: T): T {
  for (const key of Object.keys(object)) {
    if (object[key] === undefined) delete object[key]
  }
  return object
}

/**
 * Builds the capabilities object sent to TestingBot. Credentials are only
 * added when `includeCredentials` is true (the default).
 */
export function buildCapabilities(options: ConnectUrlOptions = {}, includeCredentials = true): TestingBotCapabilities {
  const tbOptions: Record<string, unknown> = compact({
    ...(options.tbOptions ?? {}),
    name: options.name ?? options.tbOptions?.name,
    build: options.build ?? options.tbOptions?.build,
    tunnelIdentifier: options.tunnelIdentifier ?? options.tbOptions?.tunnelIdentifier
  })
  if (includeCredentials) {
    const { key, secret } = getCredentials(options)
    tbOptions.key = key
    tbOptions.secret = secret
  }
  return compact({
    ...(options.capabilities ?? {}),
    browserName: toTestingBotBrowserName(options.browserName),
    browserVersion: options.browserVersion ?? 'latest',
    platform: options.platform,
    'tb:options': tbOptions
  }) as TestingBotCapabilities
}

/**
 * Returns the WebSocket URL to pass to `browserType.connect()`. It contains your credentials:
 * do not put it in `playwright.config` (`use.connectOptions`), where Playwright copies it into
 * traces and reports. `withTestingBot()` and the `test` of this package handle that for you.
 *
 * ```ts
 * const browser = await chromium.connect(getConnectUrl({ browserName: 'chrome', platform: 'WIN11', name: 'My test' }))
 * ```
 */
export function getConnectUrl(options: ConnectUrlOptions = {}, includeCredentials = true): string {
  const endpoint = options.endpoint ?? options.env?.TESTINGBOT_PLAYWRIGHT_ENDPOINT ?? process.env.TESTINGBOT_PLAYWRIGHT_ENDPOINT ?? DEFAULT_ENDPOINT
  const capabilities = buildCapabilities(options, includeCredentials)
  const separator = endpoint.includes('?') ? '&' : '?'
  return `${endpoint}${separator}capabilities=${encodeURIComponent(JSON.stringify(capabilities))}`
}

/** A short label for a browser spec, for example `chrome@latest:WIN11`. */
export function describeBrowser(spec: BrowserSpec): string {
  const base = `${toTestingBotBrowserName(spec.browserName)}@${spec.browserVersion ?? 'latest'}`
  return spec.platform ? `${base}:${spec.platform}` : base
}

/** Replaces every occurrence of `secrets` in `text` with `***`. */
export function redact(text: string, secrets: Array<string | undefined>): string {
  let result = text
  for (const secret of secrets) {
    if (!secret) continue
    result = result.split(secret).join('***')
    const encoded = encodeURIComponent(secret)
    if (encoded !== secret) result = result.split(encoded).join('***')
  }
  return result
}
