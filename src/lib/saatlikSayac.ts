/**
 * Saatlik üretim sayacını artıran yardımcı fonksiyon.
 * PozGirisPage gibi bağımsız modüllerden fire-and-forget olarak çağrılabilir.
 */
import { supabase } from '@/lib/supabase'

function bugunStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function saatDkStr(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * O anki saate denk gelen `gunluk_uretim_takip` satırının
 * `gerceklesen_adet` alanını +1 arttırır.
 * Eşleşen satır yoksa (şablon uygulanmamış, mesai saati dışı) sessizce döner.
 */
export async function glsSayacArttir(): Promise<void> {
  const bugun = bugunStr()
  const simdi = saatDkStr()

  const { data, error } = await supabase
    .from('gunluk_uretim_takip')
    .select('id, saat_araligi')
    .eq('tarih', bugun)

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return

  const aktif = data.find(s => {
    const parts = (s.saat_araligi as string).split(' - ').map((x: string) => x.trim())
    if (parts.length !== 2) return false
    return simdi >= parts[0] && simdi < parts[1]
  })

  if (!aktif) return

  const { error: rpcError } = await supabase.rpc('saatlik_sayac_arttir', {
    p_id: aktif.id,
    p_delta: 1,
  })
  if (rpcError) throw new Error(rpcError.message)
}
