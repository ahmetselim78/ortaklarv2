import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationDizini = join(process.cwd(), 'supabase', 'migrations')
const migrationDosyalari = readdirSync(migrationDizini)
  .filter((ad) => /^\d{3}_.+\.sql$/.test(ad))
  .sort()

function migration(no: number) {
  const onEk = String(no).padStart(3, '0')
  const dosya = migrationDosyalari.find((ad) => ad.startsWith(`${onEk}_`))
  if (!dosya) throw new Error(`${onEk} migration bulunamadı`)
  return readFileSync(join(migrationDizini, dosya), 'utf8')
}

function sqlFonksiyonu(sql: string, ad: string) {
  const escaped = ad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const eslesme = sql.match(
    new RegExp(`CREATE OR REPLACE FUNCTION\\s+public\\.${escaped}\\s*\\([\\s\\S]*?\\n\\$\\$;`, 'i'),
  )
  if (!eslesme) throw new Error(`public.${ad} fonksiyonu bulunamadı`)
  return eslesme[0]
}

describe('069+ ticari migration sözleşmesi', () => {
  it('uygulanmış 068 sonrasında boşluksuz ve benzersiz ilerler', () => {
    const yeniNumaralar = migrationDosyalari
      .map((ad) => Number(ad.slice(0, 3)))
      .filter((no) => no >= 69)

    expect(yeniNumaralar[0]).toBe(69)
    expect(new Set(yeniNumaralar).size).toBe(yeniNumaralar.length)
    expect(yeniNumaralar).toEqual(
      Array.from(
        { length: yeniNumaralar.at(-1)! - 68 },
        (_, index) => index + 69,
      ),
    )
  })

  it('planlanan 069-084 sorumluluk sınırlarını korur', () => {
    const zorunluDosyalar: Record<number, string> = {
      69: 'ticari_rbac_tipler_ve_mod_durumu',
      70: 'fiyat_listeleri_ve_surumleri',
      71: 'maliyet_tarifeleri_ve_surumleri',
      72: 'maliyet_recete_surumleri',
      73: 'musteri_profilleri_vade_kdv_ve_kur',
      74: 'cari_hareketleri_ve_bakiye_ozetleri',
      75: 'idempotency_optimistic_locking_ve_onizleme',
      76: 'kanonik_fiyatlandirma_motoru',
      77: 'siparis_fiyat_revizyonlari_ve_rpc',
      78: 'bagimsiz_teklifler',
      79: 'golge_fiyatlandirma',
      80: 'ticari_audit_rls_aal2_guvenlik',
      81: 'readiness_legacy_gecis_ve_indeksler',
      82: 'sade_maliyet_veri_modeli',
      83: 'sade_maliyet_rpc_ve_hesap_motoru',
      84: 'maliyet_alis_fiyati_gecersiz_kilma',
    }

    for (const [no, ad] of Object.entries(zorunluDosyalar)) {
      expect(migrationDosyalari).toContain(`${String(no).padStart(3, '0')}_${ad}.sql`)
    }
  })
})

describe('maliyet alış fiyatı geçersiz kılma sözleşmesi', () => {
  const gecersizKilmaSql = migration(84)

  it('fiyatı silmek yerine append-only gerekçeli kayıt oluşturur', () => {
    expect(gecersizKilmaSql).toMatch(
      /CREATE TABLE public\.maliyet_alis_fiyati_gecersiz_kilmalari/i,
    )
    expect(gecersizKilmaSql).toMatch(
      /alis_fiyati_id uuid NOT NULL UNIQUE[\s\S]*?REFERENCES public\.maliyet_alis_fiyatlari\(id\) ON DELETE RESTRICT/i,
    )
    expect(gecersizKilmaSql).toMatch(
      /BEFORE UPDATE OR DELETE ON public\.maliyet_alis_fiyati_gecersiz_kilmalari[\s\S]*?maliyet_tarihceli_kaydi_koru\(\)/i,
    )
    expect(gecersizKilmaSql).not.toMatch(
      /DELETE FROM public\.maliyet_alis_fiyatlari/i,
    )
  })

  it('admin ve AAL2 kontrolünden sonra idempotent geçersiz kılma yapar', () => {
    const gecersizKil = sqlFonksiyonu(
      gecersizKilmaSql,
      'maliyet_alis_fiyati_gecersiz_kil',
    )

    expect(gecersizKil).toMatch(/has_permission\('admin', 'manage'\)/i)
    expect(gecersizKil).toMatch(/current_aal2\(\)/i)
    expect(gecersizKil).toContain('ticari_idempotency_baslat')
    expect(gecersizKil).toContain('ticari_idempotency_basarili')
    expect(gecersizKil).toMatch(
      /FROM public\.maliyet_alis_fiyatlari[\s\S]*?FOR UPDATE/i,
    )
  })

  it('güncel fiyat çözümünde geçersiz kaydı atlayıp önceki kayda döner', () => {
    const guncelFiyat = sqlFonksiyonu(
      gecersizKilmaSql,
      'maliyet_guncel_alis_fiyatlari',
    )

    expect(guncelFiyat).toMatch(
      /NOT EXISTS \([\s\S]*?maliyet_alis_fiyati_gecersiz_kilmalari[\s\S]*?alis_fiyati_id = fiyat\.id/i,
    )
    expect(guncelFiyat).toMatch(
      /row_number\(\) OVER \([\s\S]*?gecerli_baslangic DESC[\s\S]*?fiyat_sirasi = 1/i,
    )
  })

  it('admin tarihçe ekranını güvenli RPC üzerinden besler', () => {
    const tarihce = sqlFonksiyonu(
      gecersizKilmaSql,
      'maliyet_alis_fiyati_tarihcesi',
    )

    expect(tarihce).toMatch(/SECURITY DEFINER/i)
    expect(tarihce).toMatch(/SET search_path = pg_catalog,\s*public/i)
    expect(tarihce).toMatch(/has_permission\('admin', 'manage'\)/i)
    expect(tarihce).toMatch(/current_aal2\(\)/i)
    expect(tarihce).toMatch(/LIMIT LEAST\(GREATEST\(COALESCE\(p_limit, 500\), 1\), 2000\)/i)
  })
})

describe('ticari surum yarislari ve kanonik hesaplama baglami', () => {
  const motorSql = migration(76)
  const teklifSql = migration(78)
  const guvenlikSql = migration(80)

  it('yayin ve kopyalama ayni parent advisory kilidini kullanir ve taslak kaynak kopyalanmaz', () => {
    const yayinla = sqlFonksiyonu(guvenlikSql, 'ticari_surum_yayinla_internal')
    const fiyatKopyala = sqlFonksiyonu(guvenlikSql, 'fiyat_listesi_surumu_kopyala')
    const genelKopyala = sqlFonksiyonu(guvenlikSql, 'ticari_surum_kopyala_internal')

    expect(yayinla).toContain("p_tablo || ':' || v_parent_id::text")
    expect(fiyatKopyala).toContain(
      "'fiyat_listesi_surmleri:' || v_parent_id::text",
    )
    expect(fiyatKopyala).toMatch(
      /FROM public\.fiyat_listesi_surmleri[\s\S]*?FOR UPDATE/i,
    )
    expect(fiyatKopyala).toContain('KAYNAK_TASLAK_KOPYALANAMAZ')
    expect(fiyatKopyala).toMatch(/clock_timestamp\(\) AT TIME ZONE 'Europe\/Istanbul'/i)
    expect(genelKopyala).toMatch(
      /SELECT %I, durum::text FROM public\.%I WHERE id = \$1 FOR UPDATE/i,
    )
    expect(genelKopyala).toContain('KAYNAK_TASLAK_KOPYALANAMAZ')
    expect(genelKopyala).toMatch(
      /WHEN 'gecerli_baslangic' THEN[\s\S]*?Europe\/Istanbul[\s\S]*?WHEN 'gecerli_bitis' THEN 'NULL'/i,
    )
  })

  it('Excel ve toplu duzenleme taslak kalemlerini set-based tek transaction ile yazar', () => {
    const toplu = sqlFonksiyonu(
      guvenlikSql,
      'ticari_taslak_kalemlerini_toplu_degistir',
    )

    expect(toplu).toMatch(/FOR UPDATE/i)
    expect(toplu).toContain('REVISION_CONFLICT')
    expect(toplu).toContain('YALNIZ_TASLAK_SURUME_KALEM_YAZILABILIR')
    expect(toplu).toMatch(/jsonb_to_recordset/gi)
    expect((toplu.match(/jsonb_to_recordset/gi) ?? []).length).toBeGreaterThanOrEqual(11)
    expect(toplu).toMatch(/revision_no = revision_no \+ 1/i)
  })

  it('fiyat, maliyet, recete, KDV, vade ve profil ana kayitlarini ilk taslakla atomik olusturur', () => {
    const olustur = sqlFonksiyonu(
      guvenlikSql,
      'ticari_taslak_ana_kaydi_olustur',
    )

    for (const tur of ['fiyat', 'maliyet', 'recete', 'kdv', 'vade', 'profil']) {
      expect(olustur).toContain(`'${tur}'`)
    }
    expect(olustur).toMatch(/INSERT INTO public\.fiyat_listeleri/i)
    expect(olustur).toMatch(/INSERT INTO public\.fiyat_listesi_surmleri/i)
    expect(olustur).toMatch(/INSERT INTO public\.maliyet_tarifeleri/i)
    expect(olustur).toMatch(/INSERT INTO public\.urun_maliyet_receteleri/i)
    expect(olustur).toMatch(/INSERT INTO public\.kdv_gruplari/i)
    expect(olustur).toMatch(/INSERT INTO public\.vade_profilleri/i)
    expect(olustur).toMatch(/INSERT INTO public\.musteri_ticari_profilleri/i)
  })

  it('gelecek tarihli surumu aninda yayinlayip mevcut surumde bosluk yaratmaz', () => {
    const yayinla = sqlFonksiyonu(guvenlikSql, 'ticari_surum_yayinla_internal')

    expect(yayinla).toMatch(
      /v_gecerli_baslangic\s*>\s*\(clock_timestamp\(\) AT TIME ZONE 'Europe\/Istanbul'\)::date/i,
    )
    expect(yayinla).toContain('GELECEK_TARIHLI_SURUM_YAYINLANAMAZ')
  })

  it('sabit recete ve KDV baglami en yeni tarihli uygun surumu deterministik secer', () => {
    const receteCoz = sqlFonksiyonu(motorSql, 'ticari_recete_surumu_coz')
    const kdvCoz = sqlFonksiyonu(motorSql, 'ticari_kdv_surumu_coz')

    for (const resolver of [receteCoz, kdvCoz]) {
      expect(resolver).toMatch(
        /ORDER BY[\s\S]*?gecerli_baslangic DESC,[\s\S]*?surum_no DESC,[\s\S]*?id DESC/i,
      )
    }
    expect(receteCoz).toMatch(
      /baglam\.recete_surumu_id IS NOT NULL OR recete\.aktif/i,
    )
  })

  it('sabit baglam kimlik alanlarini payload ile degistirmeyi acik conflict yapar', () => {
    const hesapla = sqlFonksiyonu(motorSql, 'fiyat_hesapla_internal')

    expect(hesapla).toContain('SABIT_FIYAT_BAGLAMI_GECERSIZ')
    expect(hesapla).toContain('SABIT_FIYAT_BAGLAMI_CAKISMASI')
    for (const alan of ['fiyatlandirma_tarihi', 'kur_tipi', 'para_birimi']) {
      expect(hesapla).toContain(`'${alan}'`)
    }
    expect(hesapla).toMatch(/v_tarih\s*:=\s*v_baglam_tarih/i)
    expect(hesapla).toMatch(/v_kur_tipi\s*:=\s*v_baglam_kur_tipi/i)
    expect(hesapla).toMatch(/v_para_birimi\s*:=\s*v_baglam_para_birimi/i)
  })

  it('siparis bazli maliyeti bir recete kalemi icin yalniz bir kez uygular', () => {
    const hesapla = sqlFonksiyonu(motorSql, 'fiyat_hesapla_internal')

    expect(hesapla).toMatch(
      /row_number\(\) OVER \(\s*PARTITION BY rk\.id\s*ORDER BY sh\.satir_no\s*\) AS siparis_kalem_sirasi/i,
    )
    expect(hesapla).toMatch(
      /WHEN 'siparis' THEN\s*CASE WHEN siparis_kalem_sirasi = 1 THEN 1 ELSE 0 END/i,
    )
  })

  it('eksik vade kademesini ve eksik doviz snapshotini dogru hata kodlariyla ayirir', () => {
    const hesapla = sqlFonksiyonu(motorSql, 'fiyat_hesapla_internal')

    expect(hesapla).toContain('VADE_KADEMESI_EKSIK')
    expect(hesapla).toMatch(
      /fiyat_kaynagi_id IS NULL THEN 'EKSIK_SATIS_FIYATI'[\s\S]*?birim_fiyat IS NULL[\s\S]*?fiyat_kaynagi_para_birimi IS NOT NULL THEN 'KUR_EKSIK'/i,
    )
  })

  it('belge ve readiness gün sınırını Europe/Istanbul takviminden alır', () => {
    const hesapla = sqlFonksiyonu(motorSql, 'fiyat_hesapla_internal')
    const readiness = sqlFonksiyonu(migration(81), 'ticari_modul_readiness')

    expect(hesapla).toMatch(/clock_timestamp\(\) AT TIME ZONE 'Europe\/Istanbul'/i)
    expect(readiness).toMatch(/clock_timestamp\(\) AT TIME ZONE 'Europe\/Istanbul'/i)
  })

  it('kurus dagitimini gercek largest-remainder tabanlariyla yapar ve teknik farki hesaplar', () => {
    const hesapla = sqlFonksiyonu(motorSql, 'fiyat_hesapla_internal')

    expect(hesapla).toMatch(/trunc\(ham_pay,\s*2\) AS taban_pay/i)
    expect(hesapla).toMatch(/rn <= abs\(kalan_kurus\)/i)
    expect(hesapla).toMatch(
      /'hesaplama_yuvarlama_farki',\s*round\(v_hesaplama_yuvarlama_farki,\s*2\)/i,
    )
  })

  it('yalniz teklif onizlemesinde acik istekle guncel fiyat baglamina gecebilir', () => {
    const onizle = sqlFonksiyonu(motorSql, 'fiyat_onizle')
    const siparisDali = onizle.match(
      /IF v_belge_turu = 'siparis'[\s\S]*?(?=ELSIF v_belge_turu = 'teklif')/i,
    )?.[0]
    const teklifDali = onizle.match(
      /ELSIF v_belge_turu = 'teklif'[\s\S]*?(?=\n {2}END IF;\n\n {2}v_sonuc)/i,
    )?.[0]

    expect(siparisDali).toBeDefined()
    expect(teklifDali).toBeDefined()
    expect(siparisDali).not.toContain('fiyat_baglamini_yenile')
    expect(teklifDali).toContain('fiyat_baglamini_yenile')
    expect(teklifDali).toMatch(/v_sabit_baglam\s*:=\s*NULL/i)

    const teklifKaydet = sqlFonksiyonu(teklifSql, 'teklif_revizyonu_olustur')
    expect(teklifKaydet).toMatch(
      /IF NOT COALESCE\(\(p_belge ->> 'fiyat_baglamini_yenile'\)::boolean,\s*false\)[\s\S]*?v_sabit_baglam := v_onceki_revizyon\.fiyat_baglami/i,
    )
  })
})

describe('cari değişmezliği ve sipariş iptal sözleşmesi', () => {
  const cariSql = migration(74)
  const siparisSql = migration(77)

  it('cari hareketlerini UPDATE ve DELETE işlemlerine karşı append-only tutar', () => {
    expect(cariSql).toMatch(
      /CREATE TRIGGER\s+cari_hareketleri_immutable[\s\S]*?BEFORE UPDATE OR DELETE ON public\.cari_hareketleri[\s\S]*?cari_hareketi_degistirilemez\(\)/i,
    )
    expect(cariSql).toMatch(/REVOKE ALL ON public\.cari_hareketleri FROM PUBLIC, anon, authenticated/i)
  })

  it('sipariş iptalinde ilk borç yerine tüm sistem borç/alacaklarının netini tersler', () => {
    const iptal = sqlFonksiyonu(siparisSql, 'siparis_fiyatli_iptal')

    expect(iptal).toMatch(/FROM public\.siparisler[\s\S]*?FOR UPDATE/i)
    expect(iptal).toMatch(/sum\(tutar\) FILTER \(WHERE yon = 'borc'\)/i)
    expect(iptal).toMatch(/sum\(tutar\) FILTER \(WHERE yon = 'alacak'\)/i)
    expect(iptal).toMatch(/kaynak_sinifi = 'sistem'/i)
    expect(iptal).toMatch(/kaynak_turu = 'siparis'/i)
    expect(iptal).toMatch(/v_net_etki\s*:=\s*round\(v_borc_toplami\s*-\s*v_alacak_toplami,\s*2\)/i)
    expect(iptal).toMatch(/CASE WHEN v_net_etki > 0 THEN 'alacak' ELSE 'borc' END/i)
    expect(iptal).toMatch(/IF v_net_etki <> 0 THEN[\s\S]*?INSERT INTO public\.cari_hareketleri/i)
    expect(iptal).toMatch(/haric_tutulan_tahsilat_on_odeme_toplami/i)
  })

  it('sipariş kaynaklı sistem hareketlerini genel tersleme RPC’sinde reddeder', () => {
    const tersleme = sqlFonksiyonu(siparisSql, 'cari_hareket_tersle')

    expect(tersleme).toMatch(/v_hareket\.kaynak_sinifi = 'sistem'/i)
    for (const hareket of [
      'siparis_borcu',
      'siparis_farki_borc',
      'siparis_farki_alacak',
      'siparis_iptal_borc',
      'siparis_iptal_alacak',
    ]) {
      expect(tersleme).toContain(`'${hareket}'`)
    }
    expect(tersleme).toContain("MESSAGE = 'SISTEM_HAREKETI_MANUEL_TERSLENEMEZ'")
    expect(tersleme).toMatch(/terslenen_hareket_id = p_hareket_id/i)
  })

  it('tahsilat ve açılış bakiye günlerini Europe/Istanbul gece başlangıcında saklar', () => {
    const tahsilat = sqlFonksiyonu(siparisSql, 'tahsilat_kaydet')
    const acilis = sqlFonksiyonu(siparisSql, 'cari_acilis_bakiyesi_kaydet')

    for (const fonksiyon of [tahsilat, acilis]) {
      expect(fonksiyon).toMatch(/AT TIME ZONE 'Europe\/Istanbul'/i)
      expect(fonksiyon).toMatch(/\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$/i)
    }
    expect(tahsilat).toMatch(/p_payload ->> 'aciklama'[\s\S]*?< 3/i)
    expect(tahsilat).toMatch(/p_payload ->> 'islem_tarihi'[\s\S]*?IS NULL/i)
  })
})

describe('önizleme hash’i, optimistic locking ve feature mode', () => {
  const tiplerSql = migration(69)
  const siparisSql = migration(77)
  const golgeSql = migration(79)
  const readinessSql = migration(81)

  it('önizlemede girdi, bağlam ve sonuç hash’lerini ayrı ayrı doğrular', () => {
    const dogrulama = sqlFonksiyonu(siparisSql, 'fiyat_onizlemesini_dogrula')

    expect(dogrulama).toContain('FIYAT_ONIZLEME_SURESI_DOLDU')
    expect(dogrulama).toContain('FIYAT_ONIZLEME_GIRDI_CAKISMASI')
    expect(dogrulama).toContain('FIYAT_ONIZLEME_CAKISMASI')
    expect(dogrulama).toMatch(/ticari_json_hash\(p_payload\)\s*<>\s*v_onizleme\.girdi_hash/i)
    expect(dogrulama).toMatch(/fiyat_hesapla_internal\(p_payload,\s*p_sabit_baglam\)/i)
    expect(dogrulama).toMatch(/fiyat_baglam_hash[\s\S]*?sonuc_hash/i)
    expect(dogrulama).toContain("'degisen_kaynaklar'")
    expect(dogrulama).toContain("'yeni_sonuc'")
  })

  it('sipariş create/update yazımlarından önce idempotency, hash ve revision kontrolü yapar', () => {
    const olustur = sqlFonksiyonu(siparisSql, 'siparis_fiyatli_olustur')
    const guncelle = sqlFonksiyonu(siparisSql, 'siparis_fiyatli_guncelle')

    expect(olustur.indexOf('ticari_idempotency_onceki_sonuc')).toBeLessThan(
      olustur.indexOf('fiyat_onizlemesini_dogrula'),
    )
    expect(olustur.indexOf('fiyat_onizlemesini_dogrula')).toBeLessThan(
      olustur.indexOf('INSERT INTO public.siparisler'),
    )
    expect(guncelle.indexOf('FOR UPDATE')).toBeGreaterThan(-1)
    expect(guncelle.indexOf('REVISION_CONFLICT')).toBeGreaterThan(-1)
    expect(guncelle.indexOf('fiyat_onizlemesini_dogrula')).toBeLessThan(
      guncelle.indexOf('UPDATE public.siparisler'),
    )
  })

  it('hazırlık/gölge/aktif/bakım durum makinesini ve bakım davranışını sabitler', () => {
    expect(tiplerSql).toMatch(
      /CREATE TYPE public\.ticari_modul_modu AS ENUM \('hazirlik', 'golge', 'aktif', 'bakim'\)/i,
    )

    const olustur = sqlFonksiyonu(siparisSql, 'siparis_fiyatli_olustur')
    const guncelle = sqlFonksiyonu(siparisSql, 'siparis_fiyatli_guncelle')
    const iptal = sqlFonksiyonu(siparisSql, 'siparis_fiyatli_iptal')
    const modDegistir = sqlFonksiyonu(readinessSql, 'ticari_modul_modu_degistir')

    expect(olustur).toMatch(/v_mod IS DISTINCT FROM 'aktif'/i)
    expect(guncelle).toMatch(/v_mod IS DISTINCT FROM 'aktif'/i)
    expect(iptal).toMatch(/v_mod NOT IN \('aktif', 'bakim'\)/i)
    expect(modDegistir).toContain('FEATURE_MODE_GERI_DONUS_YASAK')
    expect(modDegistir).toContain('READINESS_KRITIK_EKSIK')
    expect(modDegistir).toMatch(/p_yeni_mod = 'aktif'[\s\S]*?ticari_modul_readiness\(\)/i)
  })

  it('gölge hesap sipariş revizyonu veya cari hareket üretmez', () => {
    const golgeCalistir = sqlFonksiyonu(golgeSql, 'golge_fiyatlandirma_calistir')

    expect(golgeCalistir).toContain('fiyat_hesapla_internal')
    expect(golgeCalistir).not.toMatch(/INSERT INTO public\.cari_hareketleri/i)
    expect(golgeCalistir).not.toMatch(/INSERT INTO public\.siparis_fiyat_revizyonlari/i)
  })

  it('readiness eksik fiyat, maliyet, reçete ve profil kayıtlarını yetkili detay raporuyla verir', () => {
    const rapor = sqlFonksiyonu(readinessSql, 'ticari_eksik_kayit_raporu')

    expect(rapor).toMatch(/SECURITY DEFINER/i)
    expect(rapor).toMatch(/SET search_path = pg_catalog,\s*public/i)
    expect(rapor).toContain("has_permission('pricing', 'read')")
    for (const tur of ['satis_fiyati', 'maliyet', 'recete', 'profil']) {
      expect(rapor).toContain(`p_rapor_turu = '${tur}'`)
    }
    expect(rapor).toMatch(/maliyet_tarife_surumu_id/i)
    expect(rapor).toMatch(/recete_bileseni_maliyeti_yok/i)
    expect(readinessSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.ticari_eksik_kayit_raporu\(text, date\)[\s\S]*?FROM PUBLIC, anon/i,
    )
  })
})

describe('AAL2 ve yayınlanmış sürüm koruması', () => {
  it.each([
    [74, 'cari_bakiye_ozetlerini_yeniden_olustur'],
    [77, 'siparis_fiyatli_iptal'],
    [77, 'cari_acilis_bakiyesi_kaydet'],
    [77, 'cari_hareket_tersle'],
    [80, 'ticari_surum_yayinla_internal'],
    [80, 'manuel_doviz_kuru_kaydet'],
    [81, 'ticari_readiness_kontrolu_onayla'],
    [81, 'ticari_modul_modu_degistir'],
  ])('%i migrationındaki %s işlemi AAL2 ve güvenli RPC sınırı kullanır', (no, ad) => {
    const fonksiyon = sqlFonksiyonu(migration(no as number), ad as string)

    expect(fonksiyon).toMatch(/SECURITY DEFINER/i)
    expect(fonksiyon).toMatch(/SET search_path = pg_catalog,\s*public/i)
    expect(fonksiyon).toMatch(/current_aal2\(\)/i)
    expect(fonksiyon).toMatch(/auth\.uid\(\)/i)
  })

  it('yayınlanmış ve arşivlenmiş sürüm içeriğini ortak trigger ile korur', () => {
    const ortak = sqlFonksiyonu(migration(69), 'ticari_surumu_degisiklige_karsi_koru')
    expect(ortak).toMatch(/OLD\.durum::text = 'arsiv'/i)
    expect(ortak).toMatch(/OLD\.durum::text = 'yayinda'/i)
    expect(ortak).toContain('YAYINLANMIS_SURUM_DEGISTIRILEMEZ')

    const birlesikSql = [migration(70), migration(71), migration(72), migration(73)].join('\n')
    for (const tablo of [
      'fiyat_listesi_surmleri',
      'maliyet_tarife_surmleri',
      'urun_maliyet_recete_surmleri',
      'kdv_grup_surmleri',
      'vade_profili_surmleri',
      'musteri_ticari_profil_surmleri',
    ]) {
      expect(birlesikSql).toMatch(
        new RegExp(
          `BEFORE UPDATE OR DELETE ON public\\.${tablo}[\\s\\S]{0,180}ticari_surumu_degisiklige_karsi_koru\\(\\)`,
          'i',
        ),
      )
    }
  })
})
