import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export const KEY = 'unit-test-key'
export const SECRET = 'unit-test-secret'

export function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tb-pw-'))
}

export function credentialsFile(contents: string): string {
  const file = path.join(tempDir(), '.testingbot')
  fs.writeFileSync(file, contents)
  return file
}

export function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { TESTINGBOT_KEY: KEY, TESTINGBOT_SECRET: SECRET, ...extra }
}

export function decodeCapabilities(url: string): any {
  const parsed = new URL(url)
  return JSON.parse(parsed.searchParams.get('capabilities') ?? 'null')
}
