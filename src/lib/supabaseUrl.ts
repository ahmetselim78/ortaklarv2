const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function isLoopback(hostname: string) {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase())
}

export function resolveSupabaseUrl(configuredUrl: string, pageHostname: string, isDevelopment: boolean) {
  if (!isDevelopment || !pageHostname || isLoopback(pageHostname)) return configuredUrl

  try {
    const url = new URL(configuredUrl)
    if (!isLoopback(url.hostname)) return configuredUrl

    url.hostname = pageHostname
    return url.toString().replace(/\/$/, '')
  } catch {
    return configuredUrl
  }
}
