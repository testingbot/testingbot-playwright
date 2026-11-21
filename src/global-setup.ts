import type { FullConfig } from '@playwright/test'
import { startTunnel, stopTunnel, type TunnelOptions } from './tunnel'

export const TUNNEL_IDENTIFIER_ENV = 'TESTINGBOT_PLAYWRIGHT_TUNNEL_IDENTIFIER'

/** Shape of `config.metadata.testingbot`, written by `withTestingBot()`. */
export interface TestingBotMetadata {
  tunnel?: TunnelOptions | false
  build?: string
}

/**
 * Playwright `globalSetup` that starts a TestingBot Tunnel. `withTestingBot({ tunnel: true })`
 * adds it for you. To use it by hand:
 *
 * ```ts
 * globalSetup: require.resolve('@testingbot/playwright/global-setup')
 * ```
 *
 * The tunnel identifier is read from `config.metadata.testingbot.tunnel.tunnelIdentifier`
 * or `TESTINGBOT_PLAYWRIGHT_TUNNEL_IDENTIFIER`. Returns a teardown function that stops the tunnel.
 */
export default async function globalSetup(config: FullConfig): Promise<() => Promise<void>> {
  const metadata = (config.metadata?.testingbot ?? {}) as TestingBotMetadata
  const tunnelOptions: TunnelOptions = { ...(metadata.tunnel || {}) }
  tunnelOptions.tunnelIdentifier ??= process.env[TUNNEL_IDENTIFIER_ENV]
  const started = Date.now()
  await startTunnel(tunnelOptions)
  const label = tunnelOptions.tunnelIdentifier ? ` "${tunnelOptions.tunnelIdentifier}"` : ''
  console.log(`[@testingbot/playwright] TestingBot Tunnel${label} ready after ${((Date.now() - started) / 1000).toFixed(1)}s`)
  return async () => {
    await stopTunnel()
  }
}
