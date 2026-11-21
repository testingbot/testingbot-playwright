import { afterEach, describe, expect, it, vi } from 'vitest'

const launcher = vi.hoisted(() => ({
  downloadAndRunAsync: vi.fn(async () => ({ pid: 1 })),
  killAllAsync: vi.fn(async () => {})
}))
vi.mock('testingbot-tunnel-launcher', () => ({ default: launcher, ...launcher }))

import globalSetup from '../src/global-setup'
import globalTeardown from '../src/global-teardown'
import { generateTunnelIdentifier, startTunnel } from '../src/tunnel'

describe('tunnel', () => {
  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.TESTINGBOT_PLAYWRIGHT_TUNNEL_IDENTIFIER
  })

  it('starts the tunnel with resolved credentials', async () => {
    await startTunnel({ key: 'k', secret: 's', tunnelIdentifier: 'id', verbose: true })
    expect(launcher.downloadAndRunAsync).toHaveBeenCalledWith({ apiKey: 'k', apiSecret: 's', tunnelIdentifier: 'id', verbose: true })
  })

  it('globalSetup starts the tunnel from config metadata and returns a teardown', async () => {
    process.env.TESTINGBOT_KEY ??= 'env-key'
    process.env.TESTINGBOT_SECRET ??= 'env-secret'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const teardown = await globalSetup({ metadata: { testingbot: { tunnel: { tunnelIdentifier: 'meta-id', noBump: true } } } } as any)
    expect(launcher.downloadAndRunAsync).toHaveBeenCalledWith(expect.objectContaining({ tunnelIdentifier: 'meta-id', noBump: true, apiKey: expect.any(String), apiSecret: expect.any(String) }))
    expect(log.mock.calls[0][0]).toContain('meta-id')
    await teardown()
    expect(launcher.killAllAsync).toHaveBeenCalledTimes(1)
  })

  it('globalSetup falls back to the identifier in the environment', async () => {
    process.env.TESTINGBOT_PLAYWRIGHT_TUNNEL_IDENTIFIER = 'env-id'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await globalSetup({ metadata: {} } as any)
    expect(launcher.downloadAndRunAsync).toHaveBeenCalledWith(expect.objectContaining({ tunnelIdentifier: 'env-id' }))
  })

  it('globalTeardown stops all tunnels', async () => {
    await globalTeardown()
    expect(launcher.killAllAsync).toHaveBeenCalled()
  })

  it('generates distinct identifiers', () => {
    const a = generateTunnelIdentifier()
    expect(a).toMatch(/^playwright-[a-z0-9]+-[a-z0-9]+$/)
    expect(generateTunnelIdentifier()).not.toBe(a)
  })
})
