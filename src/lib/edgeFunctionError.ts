interface FunctionErrorLike {
  context?: Response
  message?: string
}

interface FunctionErrorMessageOptions {
  serviceName?: string
  localEdgeRuntimeHint?: boolean
}

function errorMessageFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const value = payload as { error?: unknown; message?: unknown }
  if (typeof value.error === 'string' && value.error.trim()) return value.error
  if (typeof value.message === 'string' && value.message.trim()) return value.message
  return null
}

export async function functionErrorMessage(
  error: unknown,
  options: FunctionErrorMessageOptions = {},
) {
  const { serviceName = 'Edge Function', localEdgeRuntimeHint = false } = options
  const context = (error as FunctionErrorLike | null)?.context

  if (context) {
    try {
      const payloadMessage = errorMessageFromPayload(await context.clone().json())
      if (payloadMessage) return payloadMessage
    } catch {
      // Gateway yanıtı JSON olmayabilir; durum koduna göre anlaşılır mesaj üretilir.
    }

    if (context.status === 503) {
      const base = `${serviceName} geçici olarak erişilemiyor (HTTP 503).`
      return localEdgeRuntimeHint
        ? `${base} Yerel Supabase Edge Runtime'ı başlatıp yeniden deneyin.`
        : `${base} Lütfen kısa süre sonra yeniden deneyin.`
    }
    if (context.status === 504) return `${serviceName} zaman aşımına uğradı (HTTP 504). Lütfen yeniden deneyin.`
    if (context.status === 401) return 'Oturum doğrulanamadı. Lütfen yeniden giriş yapın.'
    if (context.status === 403) return 'Bu işlem için gerekli yetkiniz veya AAL2 doğrulamanız yok.'
    if (context.status >= 400) return `${serviceName} isteği başarısız oldu (HTTP ${context.status}).`
  }

  return error instanceof Error ? error.message : 'İşlem tamamlanamadı.'
}
