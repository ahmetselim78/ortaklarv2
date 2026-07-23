import { describe, expect, it } from 'vitest'
import { functionErrorMessage } from './edgeFunctionError'

describe('functionErrorMessage', () => {
  it('fonksiyonun JSON hata mesajını korur', async () => {
    const error = { context: new Response(JSON.stringify({ error: 'AAL2 doğrulaması gerekli' }), { status: 403 }) }
    await expect(functionErrorMessage(error)).resolves.toBe('AAL2 doğrulaması gerekli')
  })

  it('yerel 503 yanıtında Edge Runtime yönlendirmesi gösterir', async () => {
    const error = { context: new Response('Service Temporarily Unavailable', { status: 503 }) }
    await expect(functionErrorMessage(error, {
      serviceName: 'Kullanıcı yönetimi servisi',
      localEdgeRuntimeHint: true,
    })).resolves.toBe(
      "Kullanıcı yönetimi servisi geçici olarak erişilemiyor (HTTP 503). Yerel Supabase Edge Runtime'ı başlatıp yeniden deneyin.",
    )
  })

  it('504 gateway yanıtını anlaşılır zaman aşımı mesajına çevirir', async () => {
    const error = { context: new Response('Gateway Timeout', { status: 504 }) }
    await expect(functionErrorMessage(error, { serviceName: 'Mistral OCR servisi' }))
      .resolves.toBe('Mistral OCR servisi zaman aşımına uğradı (HTTP 504). Lütfen yeniden deneyin.')
  })

  it('düz metin 404 yanıtını JSON ayrıştırma hatasına dönüştürmez', async () => {
    const error = { context: new Response('Function not found', { status: 404 }) }
    await expect(functionErrorMessage(error, { serviceName: 'Cihaz oturumu servisi' }))
      .resolves.toBe('Cihaz oturumu servisi isteği başarısız oldu (HTTP 404).')
  })

  it('response içermeyen standart hatayı döndürür', async () => {
    await expect(functionErrorMessage(new Error('Bağlantı kesildi'))).resolves.toBe('Bağlantı kesildi')
  })
})
