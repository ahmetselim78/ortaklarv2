import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { bugununVardiyaSablonlariniUygula } from '@/lib/saatlikVardiyaAuto'
import type {
  GunlukUretimSatiri,
  HrPersonel,
  HesaplanmisSatir,
  IsGucuOzeti,
  PerformansRengi,
} from '@/types/saatlikUretim'

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

function toDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function saatDkStr(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Saat aralığını ["08:00", "09:00"] biçiminde parçalar */
function aralikParcala(aralik: string): [string, string] | null {
  const parts = aralik.split(' - ').map(s => s.trim())
  if (parts.length !== 2) return null
  return [parts[0], parts[1]]
}

/** O anki saate göre hangi satırın aktif olduğunu bulur */
function aktifSatiriBul(
  satirlar: GunlukUretimSatiri[],
  simdi: string = saatDkStr(),
): GunlukUretimSatiri | undefined {
  return satirlar.find(s => {
    const p = aralikParcala(s.saat_araligi)
    if (!p) return false
    return simdi >= p[0] && simdi < p[1]
  })
}

/** Saat diliminin geçmiş/aktif/gelecek durumunu hesaplar */
function zamanDurumuHesapla(
  saat_araligi: string,
  simdi: string = saatDkStr(),
): HesaplanmisSatir['zamanDurumu'] {
  const p = aralikParcala(saat_araligi)
  if (!p) return 'gelecek'
  if (simdi >= p[1]) return 'gecmis'
  if (simdi >= p[0]) return 'aktif'
  return 'gelecek'
}

/** Saatlik performansa göre renk döner */
function durumRengiHesapla(gerceklesen: number, hedef: number): PerformansRengi {
  if (hedef === 0) return 'gri'
  const oran = gerceklesen / hedef
  if (oran >= 1.0) return 'yesil'
  if (oran >= 0.8) return 'sari'
  return 'kirmizi'
}

// ── Hook arayüzü ──────────────────────────────────────────────────────────────

export interface UseSaatlikUretimReturn {
  /** Ham satırlar (sıralı) */
  satirlar: GunlukUretimSatiri[]
  /** Kümülatif hesaplamalar eklenmiş satırlar */
  hesaplanmisSatirlar: HesaplanmisSatir[]
  personeller: HrPersonel[]
  isGucuOzeti: IsGucuOzeti
  seciliTarih: string
  bugun: string
  yukleniyor: boolean
  hata: string | null
  /**
   * GLS barkod okuma tetikleyicisi.
   * Parametre ileride sensör/barkod değerini taşıyacak.
   * Şu an: o anki saate göre ilgili saat diliminin gerceklesen_adet'ini +1 arttırır.
   */
  handleGlsRead: (barkod?: string) => Promise<void>
  /**
   * Tamir istasyonu fire tetikleyicisi.
   * saatAraligi verilmezse o anki aktif saat dilimine uygulanır.
   */
  handleFireDetected: (saatAraligi?: string) => Promise<void>
  /** Geçmiş tarih verisi getir (arşiv) */
  fetchPastDateData: (tarih: string) => void
  /** Bugüne geri dön */
  buguneDon: () => void
  /** Bir satırın aksiyon notunu güncelle */
  aksiyonNotuGuncelle: (id: string, not: string) => Promise<void>
  /** Bir satırın NPT oranını güncelle */
  nptGuncelle: (id: string, npt: number) => Promise<void>
  yenile: () => Promise<void>
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSaatlikUretim(): UseSaatlikUretimReturn {
  const [satirlar, setSatirlar] = useState<GunlukUretimSatiri[]>([])
  const [personeller, setPersoneller] = useState<HrPersonel[]>([])
  const [seciliTarih, setSeciliTarih] = useState<string>(toDateStr())
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  const bugun = toDateStr()

  // ── Kümülatif hesaplamalar ────────────────────────────────────────────────
  const hesaplanmisSatirlar = useMemo((): HesaplanmisSatir[] => {
    let kumulatifHedef = 0
    let kumulatifGerceklesen = 0
    let kumulatifFire = 0
    const simdi = saatDkStr()
    return satirlar.map(s => {
      kumulatifHedef += s.hedef_adet
      kumulatifGerceklesen += s.gerceklesen_adet
      kumulatifFire += s.fire_adet
      return {
        ...s,
        kumulatifHedef,
        kumulatifGerceklesen,
        kumulatifFire,
        durumRengi: durumRengiHesapla(s.gerceklesen_adet, s.hedef_adet),
        zamanDurumu: zamanDurumuHesapla(s.saat_araligi, simdi),
      }
    })
  }, [satirlar])

  // ── İş gücü özeti ────────────────────────────────────────────────────────
  const isGucuOzeti = useMemo((): IsGucuOzeti => {
    const aktif = personeller.filter(p => p.is_aktif)
    const direkt = aktif.filter(p => p.rol === 'Direkt').length
    const endirekt = aktif.filter(p => p.rol === 'Endirekt').length

    const dolmusSatirlar = satirlar.filter(s => s.hedef_adet > 0)
    const npt =
      dolmusSatirlar.length > 0
        ? Math.round(
            dolmusSatirlar.reduce((acc, s) => acc + s.npt_orani, 0) /
              dolmusSatirlar.length,
          )
        : 0

    return { direkt, endirekt, toplam: aktif.length, nptYuzdesi: npt }
  }, [personeller, satirlar])

  // ── Veri getirme ──────────────────────────────────────────────────────────
  const veriGetir = useCallback(async (tarih: string) => {
    setYukleniyor(true)
    setHata(null)
    try {
      const [satirRes, personelRes] = await Promise.all([
        supabase
          .from('gunluk_uretim_takip')
          .select('*')
          .eq('tarih', tarih)
          .order('sira_no', { ascending: true }),
        supabase
          .from('hr_personel')
          .select('*')
          .eq('is_aktif', true)
          .order('ad_soyad'),
      ])

      if (satirRes.error) throw satirRes.error
      if (personelRes.error) throw personelRes.error

      let gunlukSatirlar = (satirRes.data ?? []) as GunlukUretimSatiri[]

      if (tarih === toDateStr() && gunlukSatirlar.length === 0) {
        const otomatikSonuc = await bugununVardiyaSablonlariniUygula(tarih)

        if (otomatikSonuc.durum === 'uygulandi') {
          const { data: yenilenenSatirlar, error: yenilemeError } = await supabase
            .from('gunluk_uretim_takip')
            .select('*')
            .eq('tarih', tarih)
            .order('sira_no', { ascending: true })

          if (yenilemeError) throw yenilemeError
          gunlukSatirlar = (yenilenenSatirlar ?? []) as GunlukUretimSatiri[]
        }
      }

      setSatirlar(gunlukSatirlar)
      setPersoneller((personelRes.data ?? []) as HrPersonel[])
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Veri yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }, [])

  useEffect(() => {
    veriGetir(seciliTarih)
  }, [veriGetir, seciliTarih])

  // ── Realtime aboneliği (yalnızca bugün için) ──────────────────────────────
  useEffect(() => {
    if (seciliTarih !== bugun) return

    const channel = supabase
      .channel(`uretim_takip_rt_${bugun}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gunluk_uretim_takip',
          filter: `tarih=eq.${bugun}`,
        },
        payload => {
          setSatirlar(prev =>
            prev.map(s =>
              s.id === payload.new.id
                ? { ...s, ...(payload.new as GunlukUretimSatiri) }
                : s,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gunluk_uretim_takip',
          filter: `tarih=eq.${bugun}`,
        },
        payload => {
          setSatirlar(prev => {
            const yeni = payload.new as GunlukUretimSatiri
            if (prev.some(s => s.id === yeni.id)) return prev
            return [...prev, yeni].sort((a, b) => a.sira_no - b.sira_no)
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [seciliTarih, bugun])

  // ── GLS barkod okuma ──────────────────────────────────────────────────────
  const handleGlsRead = useCallback(
    async () => {
      const hedefSatir = aktifSatiriBul(satirlar)
      if (!hedefSatir) return

      const { data, error } = await supabase.rpc('saatlik_sayac_arttir', {
        p_id: hedefSatir.id,
        p_delta: 1,
      })

      if (error) {
        setHata(error.message)
      } else {
        const yeniAdet = typeof data === 'number' ? data : hedefSatir.gerceklesen_adet + 1
        setSatirlar(prev =>
          prev.map(s =>
            s.id === hedefSatir.id
              ? { ...s, gerceklesen_adet: yeniAdet }
              : s,
          ),
        )
      }
    },
    [satirlar],
  )

  // ── Tamir istasyonu fire ──────────────────────────────────────────────────
  const handleFireDetected = useCallback(
    async (saatAraligi?: string) => {
      const hedefSatir = saatAraligi
        ? satirlar.find(s => s.saat_araligi === saatAraligi)
        : aktifSatiriBul(satirlar)

      if (!hedefSatir) return

      const { data, error } = await supabase.rpc('saatlik_fire_arttir', {
        p_id: hedefSatir.id,
        p_delta: 1,
      })

      if (error) {
        setHata(error.message)
      } else {
        const yeniAdet = typeof data === 'number' ? data : hedefSatir.fire_adet + 1
        setSatirlar(prev =>
          prev.map(s =>
            s.id === hedefSatir.id ? { ...s, fire_adet: yeniAdet } : s,
          ),
        )
      }
    },
    [satirlar],
  )

  // ── Arşiv ────────────────────────────────────────────────────────────────
  const fetchPastDateData = useCallback((tarih: string) => {
    setSeciliTarih(tarih)
  }, [])

  const buguneDon = useCallback(() => {
    setSeciliTarih(toDateStr())
  }, [])

  // ── Satır güncellemeleri ──────────────────────────────────────────────────
  const aksiyonNotuGuncelle = useCallback(async (id: string, not: string) => {
    const { error } = await supabase
      .from('gunluk_uretim_takip')
      .update({ aksiyon_notu: not.trim() || null })
      .eq('id', id)

    if (!error) {
      setSatirlar(prev =>
        prev.map(s =>
          s.id === id ? { ...s, aksiyon_notu: not.trim() || null } : s,
        ),
      )
    }
  }, [])

  const nptGuncelle = useCallback(async (id: string, npt: number) => {
    const deger = Math.max(0, Math.min(100, npt))
    const { error } = await supabase
      .from('gunluk_uretim_takip')
      .update({ npt_orani: deger })
      .eq('id', id)

    if (!error) {
      setSatirlar(prev =>
        prev.map(s => (s.id === id ? { ...s, npt_orani: deger } : s)),
      )
    }
  }, [])

  const yenile = useCallback(() => veriGetir(seciliTarih), [veriGetir, seciliTarih])

  return {
    satirlar,
    hesaplanmisSatirlar,
    personeller,
    isGucuOzeti,
    seciliTarih,
    bugun,
    yukleniyor,
    hata,
    handleGlsRead,
    handleFireDetected,
    fetchPastDateData,
    buguneDon,
    aksiyonNotuGuncelle,
    nptGuncelle,
    yenile,
  }
}
