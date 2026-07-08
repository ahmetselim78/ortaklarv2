import { supabase } from '@/lib/supabase'

const ANAHTAR = 'telegram_edge_config'

/** Cron'un edge function çağırması için ayarlar tablosuna yapılandırma yazar. */
export async function telegramEdgeConfigSenkronize(): Promise<void> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  if (!baseUrl || !anonKey) return

  const url = `${baseUrl.replace(/\/$/, '')}/functions/v1/check-and-send-report`
  const deger = {
    url,
    authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
  }

  const { data: mevcut } = await supabase
    .from('ayarlar')
    .select('id')
    .eq('anahtar', ANAHTAR)
    .maybeSingle()

  if (mevcut?.id) {
    const { error } = await supabase
      .from('ayarlar')
      .update({ deger, guncelleme: new Date().toISOString() })
      .eq('id', mevcut.id)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await supabase.from('ayarlar').insert({ anahtar: ANAHTAR, deger })
  if (error) throw new Error(error.message)
}

/** Cron yapılandırmasının kayıtlı olup olmadığını kontrol eder. */
export async function telegramEdgeConfigVarMi(): Promise<boolean> {
  const { data } = await supabase
    .from('ayarlar')
    .select('deger')
    .eq('anahtar', ANAHTAR)
    .maybeSingle()

  const cfg = data?.deger as { url?: string; authorization?: string; apikey?: string } | null
  return Boolean(cfg?.url && cfg?.authorization)
}
