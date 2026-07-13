export type TelegramRaporTipi = 'saatlik' | 'uretim_giris' | 'her_ikisi'

export interface TelegramSablon {
  baslik: boolean
  saatlik_detay: boolean
  saatlik_ozet: boolean
  istasyonlar: boolean
  araclar: boolean
  personel: boolean
  operator: boolean
  notlar: boolean
}

export interface SaatlikSatir {
  saat_araligi: string
  hedef_adet: number
  gerceklesen_adet: number
  fire_adet: number
}

export interface UretimRaporu {
  id: string
  toplam_personel: number
  notlar: string | null
  created_at: string
  operator: { ad_soyad: string } | null
  istasyon_kayitlari: Array<{
    adet: number
    fire_adet: number
    istasyon: { ad: string; sira_no: number } | null
  }>
  arac_yuklemeleri: Array<{
    adet: number
    dis_arac_plakasi: string | null
    dis_arac_adi: string | null
    arac: { plaka: string; ad: string } | null
  }>
}

const TR_AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

function gunGoster(tarih: string): string {
  const [yil, ay, gun] = tarih.split('-')
  return `${parseInt(gun)} ${TR_AYLAR[parseInt(ay) - 1]} ${yil}`
}

function escMd(text: string): string {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, c => `\\${c}`)
}

function escCode(text: string): string {
  return String(text).replace(/[`\\]/g, c => `\\${c}`)
}

function performansEmoji(oran: number): string {
  if (oran >= 95) return '🟢'
  if (oran >= 80) return '🟡'
  return '🔴'
}

function saatAraligiGoster(aralik: string): string {
  return aralik.replace(/\s*-\s*/g, ' – ')
}

function ayirici(char = '─', uzunluk = 18): string {
  return escMd(char.repeat(uzunluk))
}

function pozitifSayi(deger: number | null | undefined): number {
  return Math.max(0, Number(deger) || 0)
}

function saatlikRaporMetni(satirlar: SaatlikSatir[], sablon: TelegramSablon): string {
  const parcalar: string[] = []

  if (sablon.baslik) {
    parcalar.push('📊 *Saatlik Takip*')
    parcalar.push(ayirici())
  }

  if (sablon.saatlik_detay) {
    if (satirlar.length === 0) {
      parcalar.push('_Henüz veri girilmemiş\\._')
    } else {
      for (const s of satirlar) {
        const oran = s.hedef_adet > 0
          ? Math.round((s.gerceklesen_adet / s.hedef_adet) * 100)
          : 0
        const detay = [
          `🕐 *${escMd(saatAraligiGoster(s.saat_araligi))}*`,
          `${performansEmoji(oran)} Gerçekleşen: *${escMd(String(s.gerceklesen_adet))}* / ${escMd(String(s.hedef_adet))} \\(%${escMd(String(oran))}\\)`,
        ]
        if (pozitifSayi(s.fire_adet) > 0) {
          detay.push(`Fire: *${escMd(String(s.fire_adet))}* adet`)
        }
        parcalar.push(detay.join('\n'))
      }
    }
  }

  if (sablon.saatlik_ozet) {
    const toplamHedef = satirlar.reduce((s, r) => s + pozitifSayi(r.hedef_adet), 0)
    const toplamGercek = satirlar.reduce((s, r) => s + pozitifSayi(r.gerceklesen_adet), 0)
    const toplamFire = satirlar.reduce((s, r) => s + pozitifSayi(r.fire_adet), 0)
    const performans = toplamHedef > 0
      ? ((toplamGercek / toplamHedef) * 100).toFixed(1)
      : '0.0'
    const ozet = [
      '📌 *Gün Özeti*',
      `✅ Gerçekleşen: *${escMd(String(toplamGercek))}* adet`,
      `🎯 Hedef: *${escMd(String(toplamHedef))}* adet`,
    ]
    if (toplamFire > 0) ozet.push(`Fire: *${escMd(String(toplamFire))}* adet`)
    ozet.push(`${performansEmoji(parseFloat(performans))} Performans: *%${escMd(performans)}*`)
    parcalar.push(ozet.join('\n'))
  }

  return parcalar.join('\n\n')
}

type IstasyonToplami = { ad: string; sira_no: number; adet: number; fire: number }

function istasyonToplamlari(raporlar: UretimRaporu[]): IstasyonToplami[] {
  const toplamlar = new Map<string, IstasyonToplami>()
  for (const rapor of raporlar) {
    for (const kayit of rapor.istasyon_kayitlari) {
      const adet = pozitifSayi(kayit.adet)
      const fire = pozitifSayi(kayit.fire_adet)
      if (adet === 0 && fire === 0) continue
      const ad = kayit.istasyon?.ad ?? '—'
      const anahtar = `${kayit.istasyon?.sira_no ?? 0}:${ad}`
      const mevcut = toplamlar.get(anahtar) ?? {
        ad,
        sira_no: kayit.istasyon?.sira_no ?? 0,
        adet: 0,
        fire: 0,
      }
      mevcut.adet += adet
      mevcut.fire += fire
      toplamlar.set(anahtar, mevcut)
    }
  }
  return [...toplamlar.values()].sort((a, b) => a.sira_no - b.sira_no || a.ad.localeCompare(b.ad, 'tr'))
}

function toplamTablosu(toplamlar: IstasyonToplami[]): string {
  const adGenisligi = Math.max('İstasyon'.length, ...toplamlar.map(t => t.ad.length))
  const adetGenisligi = Math.max('Adet'.length, ...toplamlar.map(t => String(t.adet).length))
  const fireGenisligi = Math.max('Fire'.length, ...toplamlar.map(t => String(t.fire).length))
  const satirlar = [
    `${'İstasyon'.padEnd(adGenisligi)} | ${'Adet'.padStart(adetGenisligi)} | ${'Fire'.padStart(fireGenisligi)}`,
    `${'-'.repeat(adGenisligi)}-+-${'-'.repeat(adetGenisligi)}-+-${'-'.repeat(fireGenisligi)}`,
    ...toplamlar.map(t =>
      `${t.ad.padEnd(adGenisligi)} | ${String(t.adet).padStart(adetGenisligi)} | ${String(t.fire).padStart(fireGenisligi)}`,
    ),
  ]
  return `*Günlük İstasyon Toplamları*\n\`\`\`\n${escCode(satirlar.join('\n'))}\n\`\`\``
}

function uretimGirisRaporMetni(raporlar: UretimRaporu[], sablon: TelegramSablon): string {
  const parcalar: string[] = []

  if (sablon.baslik) {
    parcalar.push('🏭 *Üretim Girişi*')
    parcalar.push(ayirici())
  }

  if (raporlar.length === 0) {
    parcalar.push('_Henüz giriş yapılmamış\\._')
    return parcalar.join('\n\n')
  }

  raporlar.forEach((rapor, idx) => {
    const blok: string[] = []
    const kayitNo = raporlar.length > 1 ? ` ${idx + 1}` : ''
    const bilgiler: string[] = []

    if (sablon.operator) bilgiler.push(`👤 ${escMd(rapor.operator?.ad_soyad ?? 'Bilinmiyor')}`)
    if (sablon.personel && pozitifSayi(rapor.toplam_personel) > 0) {
      bilgiler.push(`👥 ${escMd(String(rapor.toplam_personel))} personel`)
    }
    blok.push(`*Kayıt${escMd(kayitNo)}*${bilgiler.length > 0 ? `\n${bilgiler.join(' · ')}` : ''}`)

    if (sablon.istasyonlar) {
      const sirali = [...rapor.istasyon_kayitlari]
        .filter(k => pozitifSayi(k.adet) > 0 || pozitifSayi(k.fire_adet) > 0)
        .sort((a, b) => (a.istasyon?.sira_no ?? 0) - (b.istasyon?.sira_no ?? 0))
      if (sirali.length > 0) {
        const satirlar = sirali.map(k => {
          const bilgiler = [`• ${escMd(k.istasyon?.ad ?? '—')} — *${escMd(String(pozitifSayi(k.adet)))}* adet`]
          if (pozitifSayi(k.fire_adet) > 0) {
            bilgiler.push(`  Fire: *${escMd(String(k.fire_adet))}* adet`)
          }
          return bilgiler.join('\n')
        })
        blok.push(`*İstasyonlar*\n${satirlar.join('\n')}`)
      }
    }

    if (sablon.araclar) {
      const yuklemeler = rapor.arac_yuklemeleri.filter(y => pozitifSayi(y.adet) > 0)
      if (yuklemeler.length > 0) {
        const satirlar = yuklemeler.map(y => {
          const plaka = escMd(y.arac?.plaka ?? y.dis_arac_plakasi ?? '—')
          const ad = escMd(y.arac?.ad ?? y.dis_arac_adi ?? 'Harici')
          return `• ${plaka} \\(${ad}\\) — *${escMd(String(y.adet))}* adet`
        })
        blok.push(`*Araç Yüklemeleri*\n${satirlar.join('\n')}`)
      }
    }

    if (sablon.notlar && rapor.notlar?.trim()) {
      blok.push(`📝 *Not:* ${escMd(rapor.notlar.trim())}`)
    }

    parcalar.push(blok.join('\n\n'))
    if (idx < raporlar.length - 1) parcalar.push(ayirici('·', 12))
  })

  if (sablon.istasyonlar) {
    const toplamlar = istasyonToplamlari(raporlar)
    if (toplamlar.length > 0) parcalar.push(toplamTablosu(toplamlar))
  }

  return parcalar.join('\n\n')
}

export function raporOlustur(
  tarih: string,
  saat: string,
  raporTipi: TelegramRaporTipi,
  sablon: TelegramSablon,
  saatlikSatirlar: SaatlikSatir[],
  uretimRaporlari: UretimRaporu[],
): string {
  const baslik = [
    '📋 *Günlük Üretim Raporu*',
    ayirici('━'),
    `📅 *${escMd(gunGoster(tarih))}* · *${escMd(saat)}*`,
  ].join('\n')
  const bolumler: string[] = [baslik]

  if (raporTipi === 'saatlik' || raporTipi === 'her_ikisi') {
    const metin = saatlikRaporMetni(saatlikSatirlar, sablon)
    if (metin) bolumler.push(metin)
  }
  if (raporTipi === 'uretim_giris' || raporTipi === 'her_ikisi') {
    const metin = uretimGirisRaporMetni(uretimRaporlari, sablon)
    if (metin) bolumler.push(metin)
  }
  return bolumler.join('\n\n')
}

/** Telegram'ın MarkdownV2 ile göstereceği içeriği admin önizlemesinde düz metne çevirir. */
export function markdownV2DuzMetin(metin: string): string {
  return metin
    .replace(/```\n?/g, '')
    .replace(/(^|[^\\])[*_]/g, '$1')
    .replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1')
}
