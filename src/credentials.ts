import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface Credentials {
  key: string
  secret: string
}

export interface CredentialOptions {
  key?: string
  secret?: string
  /** Override the environment (mainly for tests). Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
  /** Override the location of the `~/.testingbot` file (mainly for tests). */
  credentialsFile?: string
}

/**
 * Reads the `~/.testingbot` file, which contains `key:secret` on a single line.
 * Returns `undefined` when the file does not exist or is malformed.
 */
export function readCredentialsFile(file = path.join(os.homedir(), '.testingbot')): Credentials | undefined {
  let contents: string
  try {
    contents = fs.readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  const line = contents.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0)
  if (!line) return undefined
  const index = line.indexOf(':')
  if (index <= 0 || index === line.length - 1) return undefined
  return { key: line.slice(0, index).trim(), secret: line.slice(index + 1).trim() }
}

/**
 * Resolves TestingBot credentials, in this order:
 * 1. explicit `key` / `secret` options
 * 2. `TESTINGBOT_KEY` / `TESTINGBOT_SECRET`
 * 3. `TB_KEY` / `TB_SECRET`
 * 4. the `~/.testingbot` file (`key:secret`)
 */
export function findCredentials(options: CredentialOptions = {}): Credentials | undefined {
  const env = options.env ?? process.env
  const key = options.key ?? env.TESTINGBOT_KEY ?? env.TB_KEY
  const secret = options.secret ?? env.TESTINGBOT_SECRET ?? env.TB_SECRET
  if (key && secret) return { key, secret }
  if (key || secret) {
    // Half a pair from the environment: complete it from the file only if the key matches.
    const fromFile = readCredentialsFile(options.credentialsFile)
    if (fromFile && (!key || fromFile.key === key)) return { key: key ?? fromFile.key, secret: secret ?? fromFile.secret }
    return undefined
  }
  return readCredentialsFile(options.credentialsFile)
}

/** Like {@link findCredentials}, but throws a helpful error when nothing is found. */
export function getCredentials(options: CredentialOptions = {}): Credentials {
  const credentials = findCredentials(options)
  if (!credentials) {
    throw new Error(
      '[@testingbot/playwright] No TestingBot credentials found. Set TESTINGBOT_KEY and TESTINGBOT_SECRET ' +
        '(or TB_KEY / TB_SECRET), or create ~/.testingbot containing "key:secret". ' +
        'Your key and secret are listed at https://testingbot.com/members/user/edit'
    )
  }
  return credentials
}
