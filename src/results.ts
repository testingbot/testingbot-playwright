import type { TestInfo } from '@playwright/test'
import { stripAnsi } from './executor'

export const MAX_REASON = 1000

export interface Outcome {
  passed: boolean
  reason?: string
}

type NameInfo = Pick<TestInfo, 'titlePath' | 'retry'>
type OutcomeInfo = Pick<TestInfo, 'status' | 'expectedStatus' | 'error'>

/** The TestingBot test name for a Playwright test: `file › describe › title`, plus ` (retry N)`. */
export function testName(testInfo: NameInfo, options: { name?: string } = {}): string {
  const base = options.name ?? testInfo.titlePath.filter(Boolean).join(' › ')
  return testInfo.retry > 0 ? `${base} (retry ${testInfo.retry})` : base
}

/**
 * Pass/fail for TestingBot. A test passes when its status matches the expected status,
 * so `test.fail()` tests that fail are reported as passed. Skipped tests return `undefined`.
 */
export function outcome(testInfo: OutcomeInfo): Outcome | undefined {
  if (testInfo.status === 'skipped' && testInfo.expectedStatus === 'skipped') return undefined
  if (testInfo.status === 'skipped') return undefined
  const passed = testInfo.status === testInfo.expectedStatus
  if (passed) return { passed }
  const message = testInfo.error?.message ? stripAnsi(testInfo.error.message) : `Test ${testInfo.status}`
  return { passed, reason: message.slice(0, MAX_REASON) }
}
