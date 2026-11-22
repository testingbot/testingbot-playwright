# @testingbot/playwright

Run [Playwright Test](https://playwright.dev/docs/intro) on [TestingBot](https://testingbot.com) with a few lines of config:

- `withTestingBot(config, options)` turns your projects into TestingBot projects (Chrome, Edge, Firefox and Safari/WebKit on Windows, macOS and Linux).
- Each test runs in its own TestingBot session, named after the test, and its pass/fail status (with the error message) is sent to TestingBot.
- `tunnel: true` starts a [TestingBot Tunnel](https://testingbot.com/support/tunnel) before the run and stops it afterwards, so the remote browsers can open `localhost` and other internal sites.
- `getConnectUrl()` builds the WebSocket URL for `browserType.connect()` when you use Playwright without the test runner.

Requires Node.js 20 or later and `@playwright/test` 1.49 or later.

## Install

```sh
npm install --save-dev @testingbot/playwright
```

## Credentials

Your TestingBot key and secret are read from, in this order:

1. `TESTINGBOT_KEY` and `TESTINGBOT_SECRET`
2. `TB_KEY` and `TB_SECRET`
3. the file `~/.testingbot`, containing `key:secret` on one line (the TestingBot CLI and other TestingBot tools write this file)

You find them in the [TestingBot member area](https://testingbot.com/members/user/edit). The credentials are only sent to TestingBot: they are not written to the `testingbot` project option, to the report metadata or to the reporter output.

## Playwright Test

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'
import { withTestingBot } from '@testingbot/playwright'

export default withTestingBot(
  defineConfig({
    testDir: './tests',
    timeout: 60_000
  }),
  {
    browsers: [
      { browserName: 'chrome', browserVersion: 'latest', platform: 'WIN11' },
      { browserName: 'firefox', platform: 'LINUX' },
      { browserName: 'safari', platform: 'SEQUOIA' }
    ]
  }
)
```

Import `test` and `expect` from this package instead of `@playwright/test`:

```ts
// tests/home.spec.ts
import { test, expect } from '@testingbot/playwright'

test('home page has a title', async ({ page }) => {
  await page.goto('https://testingbot.com/')
  await expect(page).toHaveTitle(/TestingBot/)
})
```

```sh
npx playwright test
```

At the end of the run the reporter prints the TestingBot link of every test:

```
TestingBot sessions:
  passed   [chrome@latest:WIN11] home page has a title
           https://testingbot.com/members/tests/5b2b7416...
```

### What `withTestingBot` does

- **Projects.** With `browsers`, each browser becomes a project, named like `chrome@latest:WIN11` (or the `name` you give it). When your config already has projects, each of them runs on each browser (`e2e chrome@latest:WIN11`, ...), and `dependencies` are kept per browser. Without `browsers`, your existing projects are converted using their `browserName`, `channel` (`msedge` becomes Edge) or device's `defaultBrowserType`. Without either, the tests run on the latest Chrome.
- **Opting out.** A project with `use: { testingbot: false }` is left alone and runs locally. You can also pin a project to a browser with `use: { testingbot: { browserName: 'chrome', browserVersion: '120', platform: 'WIN10' } }`.
- **Build.** All sessions of a run are grouped in one build: `TESTINGBOT_BUILD` if set, otherwise a generated `playwright <date>` name. Pass `build: 'my build'` or `build: false`.
- **Reporter.** The TestingBot reporter is added after your reporters. Pass `reporter: { outputFile: 'testingbot.json' }` to also write the sessions as JSON (useful in CI), or `reporter: false` to leave it out.
- **Credentials stay out of reports and traces.** Playwright copies each project's `use` into its reports, and records the parameters of `connect` in traces. The config therefore holds no credentials: the fixtures of this package add them when they connect, in a way the trace does not record. The `browser` fixture is replaced too, so tests that call `browser.newContext()` share the worker's TestingBot session.

### Options

| Option | Default | |
| --- | --- | --- |
| `browsers` | from your projects | `{ browserName, browserVersion, platform, name?, tbOptions?, use? }[]`. `browserName`: `chrome`, `edge`, `firefox`, `webkit` or `safari`. |
| `build` | `TESTINGBOT_BUILD` or generated | Build name, or `false`. |
| `name` | the test title | Fixed name for every session. |
| `tunnel` | off | `true`, or [testingbot-tunnel-launcher options](https://github.com/testingbot/testingbot-tunnel-launcher#options). See below. |
| `sessionPerTest` | `true` | `false`: one session per worker, the way Playwright Test reuses browsers. |
| `tbOptions` | | Extra [`tb:options`](https://testingbot.com/support/web-automate/playwright/options), for example `{ screenrecorder: true, timeZone: 'Europe/Brussels' }`. |
| `capabilities` | | Extra top-level capabilities. |
| `reporter` | `true` | `{ printLinks?, outputFile? }` or `false`. |
| `endpoint` | `wss://cloud.testingbot.com/playwright` | Also `TESTINGBOT_PLAYWRIGHT_ENDPOINT`. |

`defineConfig(config, options)` is an alias of `withTestingBot`.

### Session per test or per worker

By default every test opens its own TestingBot session. That gives every test its own name, status, video and logs in the dashboard, at the cost of a new connection per test (a few seconds). The time spent connecting, including time waiting for a free session, is added to the test's timeout.

With `sessionPerTest: false`, tests share one session per worker, like Playwright Test does locally. The session is named `<project> (worker N)` and marked failed when one of its tests failed; the failed tests and their errors are listed in the status message.

### Test status

After each test the fixture sends `setSessionStatus` through the [TestingBot executor](https://testingbot.com/support/web-automate/playwright/mark-test-status). A test passes when its status matches the expected status, so a `test.fail()` test that fails is reported as passed. Skipped tests get no status. The failure message (without colour codes, at most 1000 characters) is sent as the reason.

The session is available in the test as a fixture and as an annotation:

```ts
test('...', async ({ page, testingbotSession }) => {
  // testingbotSession.remote: true when running on TestingBot
  // testingbotSession.sessionId: set after the test
})
```

Annotation `testingbot-session` holds the link to the session in the dashboard, and is shown in the HTML report.

## TestingBot Tunnel

```ts
export default withTestingBot(defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:3000' },
  webServer: { command: 'npm start', url: 'http://localhost:3000' }
}), {
  browsers: [{ browserName: 'chrome' }],
  tunnel: true
})
```

`tunnel: true` adds a `globalSetup` (before your own) that starts the tunnel with [testingbot-tunnel-launcher](https://github.com/testingbot/testingbot-tunnel-launcher) and stops it when the run ends. A unique tunnel identifier is generated and sent with every session, so parallel CI jobs on the same account each use their own tunnel. Pass launcher options to configure it:

```ts
tunnel: { tunnelIdentifier: 'checkout', verbose: true, tunnelVersion: '5.0' }
```

Use a tunnel you started yourself (for example with the [GitHub Action](https://github.com/testingbot/testingbot-tunnel-action)):

```ts
tunnel: { tunnelIdentifier: process.env.TB_TUNNEL_ID, start: false }
```

The tunnel needs Java (17 for tunnel 5.0, 11 for older versions).

**HTTPS through the tunnel.** TestingBot Tunnel decrypts HTTPS (SSL bumping) with a TestingBot certificate, and the Playwright browsers on TestingBot trust that certificate in tunnel sessions. Firefox only does so with Playwright 1.53 or later; on older versions pass `noBump: true` to forward HTTPS untouched.

You can also use the setup on its own:

```ts
export default defineConfig({
  globalSetup: require.resolve('@testingbot/playwright/global-setup'),
  metadata: { testingbot: { tunnel: { tunnelIdentifier: 'my-tunnel' } } }
})
```

## Playwright without the test runner

```ts
import { chromium } from 'playwright'
import { getConnectUrl } from '@testingbot/playwright'

const browser = await chromium.connect(getConnectUrl({
  browserName: 'chrome',
  browserVersion: 'latest',
  platform: 'WIN11',
  name: 'My first test',
  build: 'Nightly',
  tunnelIdentifier: 'my-tunnel'
}))
```

The URL contains your credentials, so keep it out of `playwright.config` (`use.connectOptions`): Playwright writes that into its reports and traces. Use `toPlaywrightBrowserName('edge')` (`chromium`) to pick the browser type, and `runExecutor(page, { action: 'setSessionStatus', arguments: { passed: true } })` to send the result. `startTunnel()` and `stopTunnel()` start and stop a tunnel.

## Limitations

- In the default session-per-test mode the `context` fixture is provided by this package. The context options from `use` are applied (viewport, locale, `baseURL`, `storageState`, ...), but Playwright's own `video` option is not: TestingBot records video itself (`tbOptions: { screenrecorder: true }`). Traces and screenshots work as usual.
- Tests that use the `browser` fixture directly (`browser.newContext()`) share one session per worker, which gets no status.
- Tests must import `test` from `@testingbot/playwright`. With `test` from `@playwright/test`, TestingBot refuses the connection with `Missing key or secret`, since the config holds no credentials.

## Development

```sh
npm install
npm test           # unit tests
npm run typecheck
npm run build
```

## License

MIT
