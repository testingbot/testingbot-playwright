import { stopTunnel } from './tunnel'

/**
 * Playwright `globalTeardown` that stops the tunnels started by `@testingbot/playwright/global-setup`.
 * Only needed when you wire up the setup by hand and do not use its returned teardown.
 */
export default async function globalTeardown(): Promise<void> {
  await stopTunnel()
}
