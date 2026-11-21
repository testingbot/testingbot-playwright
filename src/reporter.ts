import * as fs from 'node:fs'
import * as path from 'node:path'
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'

/** Same value as `SESSION_ANNOTATION` in the fixtures (kept here so the reporter does not load `@playwright/test`). */
const SESSION_ANNOTATION = 'testingbot-session'

export interface TestingBotReporterOptions {
  /** Print a link to the TestingBot session of each test at the end of the run. Default `true`. */
  printLinks?: boolean
  /** Write the sessions of this run as JSON to this file (relative to the config directory). */
  outputFile?: string
}

export interface ReportedSession {
  /** The test name as sent to TestingBot (file › describe › title). */
  name: string
  title: string
  project: string
  status: TestResult['status']
  expectedStatus: TestCase['expectedStatus']
  retry: number
  url: string
  sessionId: string
}

/**
 * Lists the TestingBot session of every test. Added by `withTestingBot()`; can also be
 * configured by hand: `reporter: [['list'], ['@testingbot/playwright/reporter', { outputFile: 'testingbot.json' }]]`.
 */
export default class TestingBotReporter implements Reporter {
  private readonly options: TestingBotReporterOptions
  private readonly sessions: ReportedSession[] = []
  private rootDir = process.cwd()

  constructor(options: TestingBotReporterOptions = {}) {
    this.options = options
  }

  printsToStdio(): boolean {
    return false
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    this.rootDir = config.configFile ? path.dirname(config.configFile) : config.rootDir
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const annotations = [...(result.annotations ?? []), ...test.annotations]
    const annotation = annotations.find((a) => a.type === SESSION_ANNOTATION && a.description)
    if (!annotation?.description) return
    if (this.sessions.some((s) => s.url === annotation.description && s.title === test.title && s.retry === result.retry)) return
    const url = annotation.description
    // titlePath(): ['', project, file, ...describes, title]
    const titlePath = test.titlePath().slice(2).filter(Boolean)
    this.sessions.push({
      name: titlePath.join(' › ') + (result.retry ? ` (retry ${result.retry})` : ''),
      title: titlePath.slice(1).join(' › '),
      project: test.parent.project()?.name ?? '',
      status: result.status,
      expectedStatus: test.expectedStatus,
      retry: result.retry,
      url,
      sessionId: url.split('/').pop() ?? url
    })
  }

  onEnd(): void {
    if (this.sessions.length === 0) return
    if (this.options.printLinks !== false) {
      const lines = this.sessions.map((s) => {
        const mark = s.status === s.expectedStatus ? 'passed' : s.status
        return `  ${mark.padEnd(8)} [${s.project}] ${s.title}${s.retry ? ` (retry ${s.retry})` : ''}\n           ${s.url}`
      })
      console.log(`\nTestingBot sessions:\n${lines.join('\n')}\n`)
    }
    if (this.options.outputFile) {
      const file = path.resolve(this.rootDir, this.options.outputFile)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(this.sessions, null, 2))
    }
  }
}
