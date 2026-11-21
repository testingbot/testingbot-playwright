# Changelog

## 0.1.0 (unreleased)

- `withTestingBot()` / `defineConfig()` to run Playwright Test projects on TestingBot.
- `test` fixtures: one TestingBot session per test (or per worker), named after the test, with pass/fail status.
- Reporter that lists the TestingBot session of every test, optionally as JSON.
- `tunnel` option, `global-setup` and `global-teardown` to start and stop TestingBot Tunnel.
- `getConnectUrl()`, `buildCapabilities()`, `getCredentials()`, `startTunnel()` / `stopTunnel()`.
