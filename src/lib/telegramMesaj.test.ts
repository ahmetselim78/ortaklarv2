import { describe, expect, it } from 'vitest'
import {
  markdownV2DuzMetin,
  raporOlustur,
  type TelegramSablon,
  type UretimRaporu,
} from '../../supabase/functions/_shared/telegramMessage'

const sablon: TelegramSablon = {
  baslik: true,
  saatlik_detay: true,
  saatlik_ozet: true,
  istasyonlar: true,
  araclar: true,
  personel: true,
  operator: true,
  notlar: true,
}

function rapor(
  id: string,
  operator: string,
  istasyonlar: UretimRaporu['istasyon_kayitlari'],
): UretimRaporu {
  return {
    id,
    toplam_personel: 0,
    notlar: null,
    created_at: '',
    operator: { ad_soyad: operator },
    istasyon_kayitlari: istasyonlar,
    arac_yuklemeleri: [{ adet: 0, dis_arac_plakasi: '34 TEST', dis_arac_adi: null, arac: null }],
  }
}

describe('Telegram üretim girişi mesajı', () => {
  it('kayıtları ayrı gösterir, sıfırları gizler ve istasyon toplam tablosu ekler', () => {
    const mesaj = markdownV2DuzMetin(raporOlustur('2026-07-13', '17:00', 'uretim_giris', sablon, [], [
      rapor('1', 'Ali', [
        { adet: 10, fire_adet: 2, istasyon: { ad: 'Kesim', sira_no: 1 } },
        { adet: 0, fire_adet: 0, istasyon: { ad: 'Robot', sira_no: 5 } },
      ]),
      rapor('2', 'Ayşe', [
        { adet: 15, fire_adet: 0, istasyon: { ad: 'Kesim', sira_no: 1 } },
      ]),
    ]))

    expect(mesaj).toContain('Kayıt 1')
    expect(mesaj).toContain('Kayıt 2')
    expect(mesaj).not.toContain('Robot')
    expect(mesaj).not.toContain('34 TEST')
    expect(mesaj).not.toContain('0 personel')
    expect(mesaj).toContain('Fire: 2 adet')
    expect(mesaj).not.toContain('🔥')
    expect(mesaj).toContain('Günlük İstasyon Toplamları')
    expect(mesaj).toMatch(/Kesim\s+\|\s+25\s+\|\s+2/)
  })
})
