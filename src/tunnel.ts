import launcher from 'testingbot-tunnel-launcher'
import type { TunnelOptions as LauncherOptions, TunnelProcess as LauncherProcess } from 'testingbot-tunnel-launcher'
import { getCredentials, type CredentialOptions } from './credentials'

export type TunnelOptions = Omit<LauncherOptions, 'apiKey' | 'apiSecret'>
export type TunnelProcess = LauncherProcess

export type StartTunnelOptions = TunnelOptions & CredentialOptions

/** Generates a tunnel identifier that is unique enough for concurrent CI jobs. */
export function generateTunnelIdentifier(prefix = 'playwright'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Starts a TestingBot Tunnel with `testingbot-tunnel-launcher` and resolves once it is ready.
 * Credentials come from the options, the environment or `~/.testingbot`.
 */
export async function startTunnel(options: StartTunnelOptions = {}): Promise<TunnelProcess> {
  const { key, secret, env, credentialsFile, ...tunnelOptions } = options
  const credentials = getCredentials({ key, secret, env, credentialsFile })
  return launcher.downloadAndRunAsync({ ...tunnelOptions, apiKey: credentials.key, apiSecret: credentials.secret })
}

/** Stops the tunnels started by this process. */
export async function stopTunnel(): Promise<void> {
  await launcher.killAllAsync()
}
