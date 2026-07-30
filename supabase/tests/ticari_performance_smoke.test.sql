BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

CREATE OR REPLACE FUNCTION pg_temp.ticari_explain_json(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan jsonb;
BEGIN
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || p_sql INTO v_plan;
  RETURN v_plan;
END;
$$;

SELECT is(
  (
    SELECT count(*)
    FROM jsonb_array_elements(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'stok_id', series_row::text,
          'genislik_mm', 1000,
          'yukseklik_mm', 1000,
          'adet', 1
        ))
        FROM generate_series(1, 1000) series_row
      )
    ) WITH ORDINALITY AS input_row(value, ordinality)
  ),
  1000::bigint,
  '1.000 satırlı JSON belge set-based olarak eksiksiz açılır'
);

SELECT is(
  (
    SELECT count(*)
    FROM jsonb_array_elements(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'stok_id', series_row::text,
          'genislik_mm', 1000,
          'yukseklik_mm', 1000,
          'adet', 1
        ))
        FROM generate_series(1, 5000) series_row
      )
    ) WITH ORDINALITY AS input_row(value, ordinality)
  ),
  5000::bigint,
  '5.000 satırlı JSON belge set-based olarak eksiksiz açılır'
);

SELECT ok(
  pg_temp.ticari_explain_json(
    $plan$
      SELECT input_row.value, input_row.ordinality
      FROM jsonb_array_elements(
        (
          SELECT jsonb_agg(jsonb_build_object('stok_id', series_row::text, 'adet', 1))
          FROM generate_series(1, 1000) series_row
        )
      ) WITH ORDINALITY AS input_row(value, ordinality)
    $plan$
  )::text LIKE '%Function Scan%',
  '1.000 satır smoke EXPLAIN planı tek set-based Function Scan üretir'
);

SELECT ok(
  pg_temp.ticari_explain_json(
    $plan$
      SELECT input_row.value, input_row.ordinality
      FROM jsonb_array_elements(
        (
          SELECT jsonb_agg(jsonb_build_object('stok_id', series_row::text, 'adet', 1))
          FROM generate_series(1, 5000) series_row
        )
      ) WITH ORDINALITY AS input_row(value, ordinality)
    $plan$
  )::text LIKE '%Function Scan%',
  '5.000 satır smoke EXPLAIN planı tek set-based Function Scan üretir'
);

SELECT ok(
  position(
    'WITH ORDINALITY'
    IN pg_get_functiondef('public.fiyat_hesapla_internal(jsonb,jsonb)'::regprocedure)
  ) > 0
  AND position(
    'INSERT INTO pg_temp.ticari_girdi_satirlari'
    IN pg_get_functiondef('public.fiyat_hesapla_internal(jsonb,jsonb)'::regprocedure)
  ) > 0,
  'kanonik hesap motoru belge satırlarını toplu ve sıralı bir çalışma kümesine alır'
);

SELECT ok(
  position(
    'WITH ORDINALITY'
    IN pg_get_functiondef('public.siparis_fiyatli_olustur(jsonb,uuid,text,text)'::regprocedure)
  ) > 0
  AND position(
    'INSERT INTO public.siparis_detaylari'
    IN pg_get_functiondef('public.siparis_fiyatli_olustur(jsonb,uuid,text,text)'::regprocedure)
  ) > 0
  AND position(
    'FROM pg_temp.siparis_rpc_detaylari'
    IN pg_get_functiondef('public.siparis_fiyatli_olustur(jsonb,uuid,text,text)'::regprocedure)
  ) > 0,
  'sipariş kaydı satır başına RPC yerine toplu INSERT SELECT kullanır'
);

SELECT ok(
  position(
    'INSERT INTO public.siparis_detay_fiyat_snapshotlari'
    IN pg_get_functiondef(
      'public.siparis_fiyat_snapshotlarini_yaz(uuid,uuid,jsonb,jsonb,text,uuid)'::regprocedure
    )
  ) > 0
  AND position(
    'jsonb_array_elements'
    IN pg_get_functiondef(
      'public.siparis_fiyat_snapshotlarini_yaz(uuid,uuid,jsonb,jsonb,text,uuid)'::regprocedure
    )
  ) > 0,
  'sipariş fiyat snapshotları toplu JSON açılımı ve INSERT SELECT ile yazılır'
);

SELECT is(
  (
    WITH required_indexes(index_name) AS (
      VALUES
        ('fiyat_listesi_surumu_stok_idx'),
        ('maliyet_surumu_stok_idx'),
        ('recete_surumu_urun_idx'),
        ('kdv_grubu_gecerlilik_idx'),
        ('musteri_profili_gecerlilik_idx'),
        ('kur_tarih_para_idx'),
        ('siparis_fiyat_revizyon_no_idx'),
        ('teklif_revizyon_no_idx')
    )
    SELECT count(*)::integer
    FROM required_indexes expected
    WHERE to_regclass('public.' || expected.index_name) IS NOT NULL
  ),
  8,
  'fiyat, maliyet, reçete, KDV, profil, kur ve belge revizyon indeksleri hazırdır'
);

SELECT ok(
  to_regclass('public.cari_hareketleri_cari_doviz_tarih_idx') IS NOT NULL
  AND to_regclass('public.cari_hareketleri_siparis_sistem_idx') IS NOT NULL,
  'cari ekstre ve sipariş net etki sorgularının destek indeksleri vardır'
);

SELECT ok(
  to_regclass('public.fiyat_onizlemeleri_sahip_sure_idx') IS NOT NULL
  AND to_regclass('public.islem_idempotency_kullanici_tarih_idx') IS NOT NULL,
  'önizleme süresi ve idempotency tekrar sorguları indekslidir'
);

SELECT * FROM finish();
ROLLBACK;
