import { describe, expect, it } from 'vitest'
import { MAX_REASON, outcome, testName } from '../src/results'

describe('results', () => {
  it('names tests after their title path', () => {
    expect(testName({ titlePath: ['login.spec.ts', 'Login', 'works'], retry: 0 })).toBe('login.spec.ts › Login › works')
    expect(testName({ titlePath: ['a.spec.ts', '', 'x'], retry: 2 })).toBe('a.spec.ts › x (retry 2)')
    expect(testName({ titlePath: ['a.spec.ts', 'x'], retry: 0 }, { name: 'Fixed' })).toBe('Fixed')
  })

  it('reports passed tests', () => {
    expect(outcome({ status: 'passed', expectedStatus: 'passed', error: undefined })).toEqual({ passed: true })
  })

  it('reports failures with a clean, truncated reason', () => {
    const result = outcome({ status: 'failed', expectedStatus: 'passed', error: { message: '\u001b[31mexpected\u001b[39m ' + 'x'.repeat(5000) } })
    expect(result?.passed).toBe(false)
    expect(result?.reason?.startsWith('expected ')).toBe(true)
    expect(result?.reason?.length).toBe(MAX_REASON)
  })

  it('treats expected failures (test.fail) as passed and timeouts as failed', () => {
    expect(outcome({ status: 'failed', expectedStatus: 'failed', error: { message: 'x' } })).toEqual({ passed: true })
    expect(outcome({ status: 'timedOut', expectedStatus: 'passed', error: undefined })).toEqual({ passed: false, reason: 'Test timedOut' })
  })

  it('does not report skipped tests', () => {
    expect(outcome({ status: 'skipped', expectedStatus: 'skipped', error: undefined })).toBeUndefined()
    expect(outcome({ status: 'skipped', expectedStatus: 'passed', error: undefined })).toBeUndefined()
  })
})
