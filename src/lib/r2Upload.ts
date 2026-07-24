import { supabase } from '@/lib/supabase'

export class R2UploadHata extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'R2UploadHata'
    this.status = status
  }
}

export interface R2UploadSonucu { url: string; key: string }

async function edgeFunctionHatasi(error: unknown): Promise<R2UploadHata> {
  let status: number | undefined
  let message = error instanceof Error ? error.message : 'Yükleme servisine ulaşılamadı.'

  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      status = context.status
      try {
        const payload = await context.clone().json() as { error?: unknown }
        if (typeof payload.error === 'string' && payload.error.trim()) message = payload.error
      } catch {
        // JSON olmayan ağ geçidi yanıtlarında SDK mesajını kullan.
      }
    }
  }

  if (message === 'Edge Function returned a non-2xx status code') {
    message = status
      ? `Fotoğraf yükleme servisi isteği tamamlayamadı (HTTP ${status}).`
      : 'Fotoğraf yükleme servisi isteği tamamlayamadı.'
  }
  return new R2UploadHata(message, status)
}

/** Tarayıcı sırrı kullanmaz; Edge Function JWT ve files:create iznini doğrular. */
export async function r2Upload(file: File, onProgress?: (percent: number) => void, kategori = 'personel'): Promise<R2UploadSonucu> {
  if (!file.type.startsWith('image/')) throw new R2UploadHata('Yalnızca görsel dosyaları yüklenebilir.', 415)
  if (file.size > 5 * 1024 * 1024) throw new R2UploadHata('Dosya 5 MB sınırını aşıyor.', 413)
  const form = new FormData()
  form.append('file', file)
  form.append('category', kategori)
  onProgress?.(10)
  const { data, error } = await supabase.functions.invoke<R2UploadSonucu>('r2-upload', { body: form })
  if (error) throw await edgeFunctionHatasi(error)
  if (!data?.url || !data.key) throw new R2UploadHata('Yükleme servisi geçerli bir URL döndürmedi.')
  onProgress?.(100)
  return data
}
