import { describe, expect, it } from 'vitest'
import { buildCapabilities, describeBrowser, getConnectUrl, redact, toPlaywrightBrowserName, toTestingBotBrowserName } from '../src/capabilities'
import { KEY, SECRET, decodeCapabilities, env } from './helpers'

describe('capabilities', () => {
  it('builds the TestingBot capabilities format', () => {
    const caps = buildCapabilities({ env: env(), browserName: 'firefox', browserVersion: '130', platform: 'WIN11', name: 'n', build: 'b', tunnelIdentifier: 't', tbOptions: { screenrecorder: false } })
    expect(caps).toEqual({
      browserName: 'firefox',
      browserVersion: '130',
      platform: 'WIN11',
      'tb:options': { screenrecorder: false, name: 'n', build: 'b', tunnelIdentifier: 't', key: KEY, secret: SECRET }
    })
  })

  it('defaults to the latest Chrome and leaves out unset values', () => {
    expect(buildCapabilities({ env: env() })).toEqual({ browserName: 'chrome', browserVersion: 'latest', 'tb:options': { key: KEY, secret: SECRET } })
  })

  it('can leave out credentials', () => {
    expect(buildCapabilities({ env: {} }, false)['tb:options']).toEqual({})
  })

  it('lets explicit options win over tbOptions and merges extra capabilities', () => {
    const caps = buildCapabilities({ env: env(), name: 'explicit', tbOptions: { name: 'from-tb', build: 'b1' }, capabilities: { 'goog:chromeOptions': { args: ['--x'] } } })
    expect(caps['tb:options']).toMatchObject({ name: 'explicit', build: 'b1' })
    expect(caps['goog:chromeOptions']).toEqual({ args: ['--x'] })
  })

  it('builds the connect URL', () => {
    const url = getConnectUrl({ env: env(), browserName: 'edge', platform: 'WIN10', name: 'My test' })
    expect(url.startsWith('wss://cloud.testingbot.com/playwright?capabilities=')).toBe(true)
    expect(decodeCapabilities(url)).toMatchObject({ browserName: 'edge', platform: 'WIN10', 'tb:options': { name: 'My test', key: KEY, secret: SECRET } })
  })

  it('supports a custom endpoint, from options or the environment', () => {
    expect(getConnectUrl({ env: env(), endpoint: 'ws://localhost:1234/pw' })).toMatch(/^ws:\/\/localhost:1234\/pw\?capabilities=/)
    expect(getConnectUrl({ env: env({ TESTINGBOT_PLAYWRIGHT_ENDPOINT: 'wss://x.test/p?a=1' }) })).toMatch(/^wss:\/\/x\.test\/p\?a=1&capabilities=/)
  })

  it('maps browser names', () => {
    expect(toTestingBotBrowserName('chromium')).toBe('chrome')
    expect(toTestingBotBrowserName('msedge')).toBe('edge')
    expect(toTestingBotBrowserName('Safari')).toBe('webkit')
    expect(toTestingBotBrowserName(undefined)).toBe('chrome')
    expect(toPlaywrightBrowserName('chrome')).toBe('chromium')
    expect(toPlaywrightBrowserName('edge')).toBe('chromium')
    expect(toPlaywrightBrowserName('firefox')).toBe('firefox')
    expect(toPlaywrightBrowserName('safari')).toBe('webkit')
  })

  it('describes browsers', () => {
    expect(describeBrowser({ browserName: 'chrome' })).toBe('chrome@latest')
    expect(describeBrowser({ browserName: 'safari', browserVersion: '18', platform: 'SEQUOIA' })).toBe('webkit@18:SEQUOIA')
  })

  it('redacts secrets, also URL encoded', () => {
    expect(redact('a s3cr/t b s3cr%2Ft', ['s3cr/t', undefined])).toBe('a *** b ***')
  })
})
