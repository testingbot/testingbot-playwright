import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { browserForProject, defineConfig, withTestingBot } from '../src/config'
import { KEY, SECRET, decodeCapabilities, env } from './helpers'

const use = (p: any) => p.use as any

describe('withTestingBot', () => {
  it('creates a project per browser', () => {
    const e = env()
    const config = withTestingBot({ testDir: './tests' }, {
      env: e,
      build: 'b1',
      browsers: [
        { browserName: 'chrome', platform: 'WIN11' },
        { browserName: 'safari', browserVersion: '18', platform: 'SEQUOIA', name: 'Safari', tbOptions: { screenrecorder: true } }
      ]
    })
    expect(config.testDir).toBe('./tests')
    expect(config.projects?.map((p) => p.name)).toEqual(['chrome@latest:WIN11', 'Safari'])
    const [chrome, safari] = config.projects!
    expect(use(chrome).browserName).toBe('chromium')
    expect(use(safari).browserName).toBe('webkit')
    expect(use(chrome).testingbot).toEqual({ build: 'b1', browserName: 'chrome', browserVersion: 'latest', platform: 'WIN11', tbOptions: {} })
    expect(use(safari).testingbot.tbOptions).toEqual({ screenrecorder: true })
    const caps = decodeCapabilities(use(chrome).connectOptions.wsEndpoint)
    expect(caps).toMatchObject({ browserName: 'chrome', platform: 'WIN11', 'tb:options': { build: 'b1', name: 'chrome@latest:WIN11' } })
    // Playwright copies `use` into reports and traces, so the config holds no credentials.
    expect(JSON.stringify(config)).not.toContain(SECRET)
    expect(JSON.stringify(config)).not.toContain(KEY)
  })

  it('never puts credentials in the testingbot option or metadata', () => {
    const config = withTestingBot({}, { env: env(), tunnel: true })
    const serialized = JSON.stringify({ use: use(config.projects![0]).testingbot, metadata: config.metadata })
    expect(serialized).not.toContain(SECRET)
    expect(serialized).not.toContain(KEY)
  })

  it('defaults to the latest Chrome when there are no projects', () => {
    const config = withTestingBot({}, { env: env() })
    expect(config.projects).toHaveLength(1)
    expect(use(config.projects![0]).testingbot.browserName).toBe('chrome')
  })

  it('converts existing projects using their browserName / channel', () => {
    const config = withTestingBot({
      projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
        { name: 'edge', use: { channel: 'msedge' } },
        { name: 'firefox', use: { browserName: 'firefox', viewport: { width: 800, height: 600 } } },
        { name: 'mobile safari', use: { defaultBrowserType: 'webkit', isMobile: true } },
        { name: 'pinned', use: { testingbot: { browserName: 'chrome', browserVersion: '120', platform: 'WIN10' } } as any },
        { name: 'local', use: { testingbot: false } as any }
      ]
    }, { env: env(), build: false })
    const names = config.projects!.map((p) => use(p).testingbot?.browserName ?? 'local')
    expect(names).toEqual(['chrome', 'edge', 'firefox', 'webkit', 'chrome', 'local'])
    expect(use(config.projects![2]).viewport).toEqual({ width: 800, height: 600 })
    expect(use(config.projects![4]).testingbot).toMatchObject({ browserVersion: '120', platform: 'WIN10' })
    expect(use(config.projects![5]).connectOptions).toBeUndefined()
    expect(use(config.projects![0]).testingbot.build).toBeUndefined()
  })

  it('runs existing projects on every browser and keeps dependencies per browser', () => {
    const config = withTestingBot({
      projects: [
        { name: 'setup', testMatch: /setup\.ts/ },
        { name: 'e2e', dependencies: ['setup'] },
        { name: 'local', use: { testingbot: false } as any }
      ]
    }, { env: env(), browsers: [{ browserName: 'chrome' }, { browserName: 'firefox' }] })
    expect(config.projects!.map((p) => [p.name, p.dependencies])).toEqual([
      ['setup chrome@latest', undefined],
      ['setup firefox@latest', undefined],
      ['e2e chrome@latest', ['setup chrome@latest']],
      ['e2e firefox@latest', ['setup firefox@latest']],
      ['local', undefined]
    ])
  })

  it('keeps one generated build name across config loads (main process and workers)', () => {
    const e = env()
    const first = use(withTestingBot({}, { env: e }).projects![0]).testingbot.build
    const second = use(withTestingBot({}, { env: e }).projects![0]).testingbot.build
    expect(first).toMatch(/^playwright \d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    expect(second).toBe(first)
    expect(use(withTestingBot({}, { env: env({ TESTINGBOT_BUILD: 'ci-42' }) }).projects![0]).testingbot.build).toBe('ci-42')
  })

  it('adds a tunnel: identifier, global setup and metadata', () => {
    const e = env()
    const config = withTestingBot({ globalSetup: './my-setup.ts' }, { env: e, tunnel: { verbose: true } })
    const id = use(config.projects![0]).testingbot.tunnelIdentifier
    expect(id).toMatch(/^playwright-/)
    expect(e.TESTINGBOT_PLAYWRIGHT_TUNNEL_IDENTIFIER).toBe(id)
    expect(config.globalSetup).toEqual([path.join(__dirname, '..', 'src', 'global-setup.js'), './my-setup.ts'])
    expect((config.metadata as any).testingbot.tunnel).toEqual({ verbose: true, tunnelIdentifier: id })
    expect(decodeCapabilities(use(config.projects![0]).connectOptions.wsEndpoint)['tb:options'].tunnelIdentifier).toBe(id)
    // Same identifier when the config is loaded again in a worker.
    expect(use(withTestingBot({}, { env: e, tunnel: true }).projects![0]).testingbot.tunnelIdentifier).toBe(id)
  })

  it('uses an existing tunnel without starting one', () => {
    const config = withTestingBot({}, { env: env(), tunnel: { tunnelIdentifier: 'mine', start: false } })
    expect(use(config.projects![0]).testingbot.tunnelIdentifier).toBe('mine')
    expect(config.globalSetup).toBeUndefined()
    expect((config.metadata as any).testingbot.tunnel).toBe(false)
  })

  it('leaves SSL bumping to the tunnel unless noBump is set', () => {
    expect((withTestingBot({}, { env: env(), tunnel: true }).metadata as any).testingbot.tunnel).not.toHaveProperty('noBump')
    const config = withTestingBot({}, { env: env(), tunnel: { noBump: true } })
    expect((config.metadata as any).testingbot.tunnel.noBump).toBe(true)
  })

  it('adds the reporter after the configured reporters', () => {
    const reporterPath = path.join(__dirname, '..', 'src', 'reporter.js')
    expect(withTestingBot({ reporter: 'html' }, { env: env() }).reporter).toEqual([['html'], [reporterPath, {}]])
    expect(withTestingBot({ reporter: [['list'], ['json', { outputFile: 'x.json' }]] }, { env: env(), reporter: { outputFile: 'tb.json' } }).reporter).toEqual([
      ['list'],
      ['json', { outputFile: 'x.json' }],
      [reporterPath, { outputFile: 'tb.json' }]
    ])
    expect(withTestingBot({ reporter: 'dot' }, { env: env(), reporter: false }).reporter).toBe('dot')
  })

  it('passes session options to every project', () => {
    const config = withTestingBot({}, { env: env(), name: 'Fixed name', sessionPerTest: false, tbOptions: { timeZone: 'Europe/Brussels' } })
    expect(use(config.projects![0]).testingbot).toMatchObject({ name: 'Fixed name', sessionPerTest: false, tbOptions: { timeZone: 'Europe/Brussels' } })
  })

  it('defineConfig is the same as withTestingBot', () => {
    expect(defineConfig({}, { env: env(), build: 'x' }).projects![0].name).toBe('chrome@latest')
  })

  it('browserForProject', () => {
    expect(browserForProject({})).toEqual({ browserName: 'chrome' })
    expect(browserForProject({ use: { channel: 'msedge-beta' } })).toEqual({ browserName: 'edge' })
  })
})
