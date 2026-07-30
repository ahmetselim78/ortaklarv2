BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(16);

SELECT ok(to_regclass('public.cari_baglantilari') IS NOT NULL, 'cari bağlantıları tablosu vardır');
SELECT ok(to_regclass('public.siparis_baglanti_dagitimlari') IS NOT NULL, 'sipariş bağlantı dağıtımları vardır');
SELECT ok(to_regclass('public.cari_tahsilat_dagitimlari') IS NOT NULL, 'tahsilat FIFO dağıtımları vardır');
SELECT ok(to_regclass('public.cari_baglanti_fiyat_duzeltmeleri') IS NOT NULL, 'açık dönem fiyat farkı günlüğü vardır');

SELECT ok(
  position('current_aal2()' IN pg_get_functiondef('public.cari_baglanti_onayla(uuid,integer,text)'::regprocedure)) > 0
  AND position('has_permission(''pricing'', ''manage'')' IN pg_get_functiondef('public.cari_baglanti_onayla(uuid,integer,text)'::regprocedure)) > 0
  AND position('has_permission(''finance'', ''create'')' IN pg_get_functiondef('public.cari_baglanti_onayla(uuid,integer,text)'::regprocedure)) > 0,
  'bağlantı onayı AAL2, fiyat yönetimi ve finans yetkisi ister'
);

SELECT ok(
  position('ticari_idempotency_baslat' IN pg_get_functiondef('public.cari_baglanti_onayla(uuid,integer,text)'::regprocedure)) > 0
  AND position('ticari_idempotency_basarili' IN pg_get_functiondef('public.cari_baglanti_onayla(uuid,integer,text)'::regprocedure)) > 0,
  'bağlantı onayı idempotenttir'
);

SELECT ok(
  position('pg_advisory_xact_lock' IN pg_get_functiondef('public.cari_baglanti_onayla(uuid,integer,text)'::regprocedure)) > 0,
  'onay cari ve döviz bazında kilit alır'
);

SELECT ok(
  position('ORDER BY dagitim.created_at, dagitim.id' IN pg_get_functiondef('public.cari_acik_tahsilati_fifo_dagit()'::regprocedure)) > 0,
  'genel tahsilat en eski açık satıştan başlayarak FIFO dağılır'
);

SELECT ok(
  position('siparis.para_birimi = NEW.para_birimi' IN pg_get_functiondef('public.cari_acik_tahsilati_fifo_dagit()'::regprocedure)) > 0,
  'FIFO tahsilat otomatik döviz mahsuplaşması yapmaz'
);

SELECT ok(
  position('LEAST(v_satir_kalan, v_baglanti.kalan)' IN pg_get_functiondef('public.siparis_baglanti_hareketini_dagit()'::regprocedure)) > 0
  AND position('adet_orani' IN pg_get_functiondef('public.siparis_baglanti_hareketini_dagit()'::regprocedure)) > 0,
  'tek fiziksel cam bağlantı sınırında ticari oranla bölünür'
);

SELECT ok(
  position('kaynak_dagitim_id' IN pg_get_functiondef('public.siparis_baglanti_hareketini_dagit()'::regprocedure)) > 0
  AND position('''iade''' IN pg_get_functiondef('public.siparis_baglanti_hareketini_dagit()'::regprocedure)) > 0,
  'iptal ve alacak revizyonu aynı dağılımı tersler'
);

SELECT ok(
  position('dagitim.acik_tutar' IN pg_get_functiondef('public.cari_baglanti_acik_donem_fark_satirlari(uuid)'::regprocedure)) > 0
  AND position('cari_tahsilat_dagitimlari' IN pg_get_functiondef('public.cari_baglanti_acik_donem_fark_satirlari(uuid)'::regprocedure)) > 0,
  'yeni bağlantı yalnız ekonomik olarak açık m²yi revize eder'
);

SELECT ok(
  position('baglanti_fiyat_farki_borc' IN pg_get_functiondef('public.cari_baglanti_acik_donemi_yeniden_fiyatla(uuid)'::regprocedure)) > 0
  AND position('baglanti_fiyat_farki_alacak' IN pg_get_functiondef('public.cari_baglanti_acik_donemi_yeniden_fiyatla(uuid)'::regprocedure)) > 0,
  'fiyat farkı append-only borç veya alacak hareketidir'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.siparis_baglanti_dagitimlari'::regclass
      AND tgname = 'siparis_baglanti_dagitimlari_immutable'
      AND NOT tgisinternal
  ),
  'sipariş dağılımları değiştirilemez'
);

SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.cari_baglantilari'::regclass)
  AND NOT has_table_privilege('authenticated', 'public.cari_baglantilari', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.cari_baglantilari', 'UPDATE'),
  'bağlantı tablosu RLS ile korunur ve yalnız RPC yazabilir'
);

SELECT ok(
  position('urun_gruplari' IN pg_get_functiondef('public.fiyat_onizle(jsonb)'::regprocedure)) > 0
  AND position('baglanti_dagilimlari' IN pg_get_functiondef('public.fiyat_onizle(jsonb)'::regprocedure)) > 0
  AND position('cari_etkisi' IN pg_get_functiondef('public.ticari_fiyat_sonucunu_zenginlestir(jsonb,jsonb)'::regprocedure)) > 0,
  'fiyat önizlemesi ürün grubu, bağlantı dağılımı ve cari etkisi döndürür'
);

SELECT * FROM finish();
ROLLBACK;
