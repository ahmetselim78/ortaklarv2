import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '.env.local dosyasında VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı olmalı.'
  )
}

async function monitoredFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
  const isReporter = url.pathname.endsWith('/functions/v1/report-error')
  if (!url.pathname.includes('/auth/v1/') && !isReporter && (response.status >= 500 || response.status === 401 || response.status === 403)) {
    window.dispatchEvent(new CustomEvent('ortaklar:api-error', { detail: {
      status: response.status,
      path: url.pathname,
      source: response.status >= 500 ? 'rpc_api' : 'authorization',
    } }))
  }
  return response
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: monitoredFetch },
})
