import { describe, expect, it } from 'vitest'
import { findCredentials, getCredentials, readCredentialsFile } from '../src/credentials'
import { credentialsFile } from './helpers'

const NO_FILE = '/nonexistent/.testingbot'

describe('credentials', () => {
  it('prefers explicit options', () => {
    expect(findCredentials({ key: 'a', secret: 'b', env: { TESTINGBOT_KEY: 'x', TESTINGBOT_SECRET: 'y' } })).toEqual({ key: 'a', secret: 'b' })
  })

  it('reads TESTINGBOT_KEY / TESTINGBOT_SECRET before TB_KEY / TB_SECRET', () => {
    expect(findCredentials({ env: { TESTINGBOT_KEY: 'x', TESTINGBOT_SECRET: 'y', TB_KEY: 'p', TB_SECRET: 'q' }, credentialsFile: NO_FILE })).toEqual({ key: 'x', secret: 'y' })
    expect(findCredentials({ env: { TB_KEY: 'p', TB_SECRET: 'q' }, credentialsFile: NO_FILE })).toEqual({ key: 'p', secret: 'q' })
  })

  it('falls back to the ~/.testingbot file', () => {
    const file = credentialsFile('filekey:filesecret\n')
    expect(findCredentials({ env: {}, credentialsFile: file })).toEqual({ key: 'filekey', secret: 'filesecret' })
  })

  it('completes half a pair from the file only when the key matches', () => {
    const file = credentialsFile('filekey:filesecret')
    expect(findCredentials({ env: { TESTINGBOT_KEY: 'filekey' }, credentialsFile: file })).toEqual({ key: 'filekey', secret: 'filesecret' })
    expect(findCredentials({ env: { TESTINGBOT_KEY: 'other' }, credentialsFile: file })).toBeUndefined()
  })

  it('handles malformed or missing files', () => {
    expect(readCredentialsFile(NO_FILE)).toBeUndefined()
    expect(readCredentialsFile(credentialsFile(''))).toBeUndefined()
    expect(readCredentialsFile(credentialsFile('nocolon'))).toBeUndefined()
    expect(readCredentialsFile(credentialsFile(':secret'))).toBeUndefined()
    expect(readCredentialsFile(credentialsFile('\n  k:s:with:colons  \r\n'))).toEqual({ key: 'k', secret: 's:with:colons' })
  })

  it('throws a helpful error without credentials, without leaking anything', () => {
    expect(() => getCredentials({ env: {}, credentialsFile: NO_FILE })).toThrow(/TESTINGBOT_KEY/)
  })
})
