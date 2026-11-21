import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TestingBotReporter from '../src/reporter'
import { tempDir } from './helpers'

function fakeTest(title: string, annotations: Array<{ type: string; description?: string }> = []) {
  return {
    title,
    expectedStatus: 'passed',
    annotations: [],
    titlePath: () => ['', 'chrome@latest', 'a.spec.ts', 'Suite', title],
    parent: { project: () => ({ name: 'chrome@latest' }) },
    _annotations: annotations
  } as any
}

describe('TestingBotReporter', () => {
  afterEach(() => vi.restoreAllMocks())

  it('collects sessions from annotations, prints links and writes JSON', () => {
    const dir = tempDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const reporter = new TestingBotReporter({ outputFile: 'out/tb.json' })
    reporter.onBegin({ configFile: path.join(dir, 'playwright.config.ts'), rootDir: dir } as any, {} as any)
    reporter.onTestEnd(fakeTest('works'), { status: 'passed', retry: 0, annotations: [{ type: 'testingbot-session', description: 'https://testingbot.com/members/tests/abc' }] } as any)
    reporter.onTestEnd(fakeTest('breaks'), { status: 'failed', retry: 1, annotations: [{ type: 'testingbot-session', description: 'https://testingbot.com/members/tests/def' }] } as any)
    reporter.onTestEnd(fakeTest('local'), { status: 'passed', retry: 0, annotations: [] } as any)
    reporter.onEnd()

    const written = JSON.parse(fs.readFileSync(path.join(dir, 'out/tb.json'), 'utf8'))
    expect(written).toEqual([
      { name: 'a.spec.ts › Suite › works', title: 'Suite › works', project: 'chrome@latest', status: 'passed', expectedStatus: 'passed', retry: 0, url: 'https://testingbot.com/members/tests/abc', sessionId: 'abc' },
      { name: 'a.spec.ts › Suite › breaks (retry 1)', title: 'Suite › breaks', project: 'chrome@latest', status: 'failed', expectedStatus: 'passed', retry: 1, url: 'https://testingbot.com/members/tests/def', sessionId: 'def' }
    ])
    expect(log.mock.calls[0][0]).toContain('https://testingbot.com/members/tests/def')
    expect(reporter.printsToStdio()).toBe(false)
  })

  it('prints nothing without TestingBot sessions', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const reporter = new TestingBotReporter()
    reporter.onEnd()
    expect(log).not.toHaveBeenCalled()
  })
})
