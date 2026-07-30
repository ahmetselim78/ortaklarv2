-- 111 - Tedarikci kartlarini yalniz saglayabildikleri maliyet stoklarina bagla
--
-- Fiyat snapshotlari append-only kalir. Bu tablo tedarikci detay ekranindaki
-- guncel urun iliskisini, varsayilan marka/kod/vade metadatasini ve iyimser
-- kilit revision bilgisini tutar. Mevcut fiyatlar kayipsiz ve idempotent olarak
-- iliskiye donusturulur; bundan sonraki her fiyat kaydi iliskiyi atomik kurar.

BEGIN;

SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.tedarikci_stok_baglantilari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tedarikci_id uuid NOT NULL
    REFERENCES public.cari(id) ON DELETE RESTRICT,
  stok_id uuid NOT NULL
    REFERENCES public.stok(id) ON DELETE RESTRICT,
  marka text,
  tedarikci_urun_kodu text,
  varsayilan_vade_gunu integer
    CHECK (varsayilan_vade_gunu BETWEEN 0 AND 3650),
  aciklama text,
  aktif boolean NOT NULL DEFAULT true,
  revision_no bigint NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  son_guncelleyen_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tedarikci_stok_baglantilari_tedarikci_stok_key
    UNIQUE (tedarikci_id, stok_id),
  CONSTRAINT tedarikci_stok_baglantilari_marka_check CHECK (
    marka IS NULL
    OR (nullif(btrim(marka), '') IS NOT NULL AND length(marka) <= 200)
  ),
  CONSTRAINT tedarikci_stok_baglantilari_urun_kodu_check CHECK (
    tedarikci_urun_kodu IS NULL
    OR (
      nullif(btrim(tedarikci_urun_kodu), '') IS NOT NULL
      AND length(tedarikci_urun_kodu) <= 120
    )
  ),
  CONSTRAINT tedarikci_stok_baglantilari_aciklama_check CHECK (
    aciklama IS NULL OR length(aciklama) <= 2000
  )
);

CREATE INDEX tedarikci_stok_baglantilari_tedarikci_aktif_idx
  ON public.tedarikci_stok_baglantilari (
    tedarikci_id,
    aktif,
    updated_at DESC
  );

CREATE INDEX tedarikci_stok_baglantilari_stok_aktif_idx
  ON public.tedarikci_stok_baglantilari (stok_id, aktif, tedarikci_id);

COMMENT ON TABLE public.tedarikci_stok_baglantilari IS
  'Tedarikci ile saglayabildigi maliyet stogu arasindaki guncel, revisionli ve auditli iliski.';
COMMENT ON COLUMN public.tedarikci_stok_baglantilari.varsayilan_vade_gunu IS
  'Bu tedarikci-stok iliskisinde fiyat giris ekranina onerilecek vade; fiyat snapshotinin yerine gecmez.';

-- Fiziksel stoklar kendi kategori kapsamini ister. Envantersiz dis temper
-- hizmeti yeni baglanti ekraninda yalniz acik temper_hizmeti kapsamini kabul
-- eder. V4 fiyat tarihcesindeki cam/yan_malzeme alias uyumlulugu fiyat kaydinda
-- korunur, fakat yeni bir tedarikci-stok baglantisi yetkisi vermez.
CREATE OR REPLACE FUNCTION public.tedarikci_stok_kapsami_uygun(
  p_tedarik_kapsamlari text[],
  p_stok_kategorisi text,
  p_hizmet_turu text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_hizmet_turu = 'temper_dis_hizmet' THEN
      'temper_hizmeti' = ANY(
        COALESCE(p_tedarik_kapsamlari, ARRAY[]::text[])
      )
    WHEN p_stok_kategorisi = 'cam' THEN
      'cam' = ANY(COALESCE(p_tedarik_kapsamlari, ARRAY[]::text[]))
    WHEN p_stok_kategorisi = 'cita' THEN
      'cita' = ANY(COALESCE(p_tedarik_kapsamlari, ARRAY[]::text[]))
    WHEN p_stok_kategorisi = 'yan_malzeme' THEN
      'yan_malzeme' = ANY(
        COALESCE(p_tedarik_kapsamlari, ARRAY[]::text[])
      )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.tedarikci_stok_baglantisi_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tedarikci_tipi text;
  v_tedarikci_aktif boolean;
  v_tedarik_kapsamlari text[];
  v_stok_kategorisi text;
  v_stok_ticari_kapsami public.stok_ticari_kapsami;
  v_stok_aktif boolean;
  v_hizmet_turu text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_SILINEMEZ',
      DETAIL = 'Baglantiyi tarihceyi koruyarak pasiflestirin.';
  END IF;

  IF current_setting('app.tedarikci_stok_baglantisi_rpc', true)
       IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_RPC_GEREKLI';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.tedarikci_id IS DISTINCT FROM OLD.tedarikci_id
       OR NEW.stok_id IS DISTINCT FROM OLD.stok_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_KIMLIGI_DEGISTIRILEMEZ';
    END IF;

    NEW.revision_no := OLD.revision_no + 1;
    NEW.created_at := OLD.created_at;
    NEW.olusturan_kullanici_id := OLD.olusturan_kullanici_id;
    NEW.updated_at := clock_timestamp();
    NEW.son_guncelleyen_kullanici_id := COALESCE(
      auth.uid(),
      OLD.son_guncelleyen_kullanici_id
    );
  ELSE
    IF NEW.revision_no <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_ILK_REVISION_GECERSIZ';
    END IF;
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := COALESCE(NEW.updated_at, NEW.created_at);
    NEW.olusturan_kullanici_id := COALESCE(
      NEW.olusturan_kullanici_id,
      auth.uid()
    );
    NEW.son_guncelleyen_kullanici_id := COALESCE(
      NEW.son_guncelleyen_kullanici_id,
      auth.uid()
    );
  END IF;

  SELECT cari.tipi, cari.aktif, cari.tedarik_kapsamlari
  INTO v_tedarikci_tipi, v_tedarikci_aktif, v_tedarik_kapsamlari
  FROM public.cari
  WHERE cari.id = NEW.tedarikci_id;

  IF NOT FOUND OR v_tedarikci_tipi <> 'tedarikci' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_TEDARIKCI_GEREKLI';
  END IF;

  SELECT
    stok.kategori,
    stok.ticari_kapsam,
    stok.aktif,
    hizmet.hizmet_turu
  INTO
    v_stok_kategorisi,
    v_stok_ticari_kapsami,
    v_stok_aktif,
    v_hizmet_turu
  FROM public.stok stok
  LEFT JOIN public.maliyet_hizmet_stoklari hizmet
    ON hizmet.stok_id = stok.id
  WHERE stok.id = NEW.stok_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_STOK_GEREKLI';
  END IF;

  -- Pasiflestirme, tedarikci veya stok sonradan pasif olmus olsa bile
  -- yapilabilmelidir. Yeni/yeniden aktif iliski ise butun kurallari saglar.
  IF NEW.aktif THEN
    IF NOT v_tedarikci_aktif THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_AKTIF_TEDARIKCI_GEREKLI';
    END IF;
    IF NOT v_stok_aktif THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_AKTIF_STOK_GEREKLI';
    END IF;
    IF v_stok_ticari_kapsami NOT IN ('maliyet_bileseni', 'her_ikisi') THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TEDARIKCI_STOK_TICARI_KAPSAMI_GECERSIZ';
    END IF;
    IF NOT public.tedarikci_stok_kapsami_uygun(
      v_tedarik_kapsamlari,
      v_stok_kategorisi,
      v_hizmet_turu
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TEDARIKCI_STOK_KAPSAMI_UYUSMUYOR';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tedarikci_stok_baglantisi_guard
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.tedarikci_stok_baglantilari
  FOR EACH ROW EXECUTE FUNCTION public.tedarikci_stok_baglantisi_guard();

-- Mevcut append-only fiyat gecmisini tek kanonik tedarikci+stok iliskisine
-- donusturur. ON CONFLICT DO NOTHING kullanici tarafindan duzeltilmis iliski
-- metadatasini sonraki calistirmalarda ezmez.
CREATE OR REPLACE FUNCTION
  public.tedarikci_stok_baglantilarini_fiyatlardan_tamamla()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_onceki_rpc text;
  v_eklenen integer := 0;
BEGIN
  v_onceki_rpc := current_setting(
    'app.tedarikci_stok_baglantisi_rpc',
    true
  );
  PERFORM set_config(
    'app.tedarikci_stok_baglantisi_rpc',
    'true',
    true
  );

  INSERT INTO public.tedarikci_stok_baglantilari (
    tedarikci_id,
    stok_id,
    marka,
    varsayilan_vade_gunu,
    aciklama,
    aktif,
    revision_no
  )
  SELECT
    son_fiyat.tedarikci_id,
    son_fiyat.stok_id,
    NULLIF(btrim(son_fiyat.marka), ''),
    son_fiyat.vade_gunu,
    'Mevcut fiyat gecmisinden otomatik olusturuldu.',
    true,
    1
  FROM (
    SELECT DISTINCT ON (fiyat.tedarikci_id, fiyat.stok_id)
      fiyat.tedarikci_id,
      fiyat.stok_id,
      fiyat.marka,
      fiyat.vade_gunu
    FROM public.stok_alis_fiyatlari fiyat
    JOIN public.cari tedarikci
      ON tedarikci.id = fiyat.tedarikci_id
     AND tedarikci.tipi = 'tedarikci'
     AND tedarikci.aktif
    JOIN public.stok stok
      ON stok.id = fiyat.stok_id
     AND stok.aktif
     AND stok.ticari_kapsam IN ('maliyet_bileseni', 'her_ikisi')
    LEFT JOIN public.maliyet_hizmet_stoklari hizmet
      ON hizmet.stok_id = stok.id
    WHERE fiyat.tedarikci_id IS NOT NULL
      AND public.tedarikci_stok_kapsami_uygun(
        tedarikci.tedarik_kapsamlari,
        stok.kategori,
        hizmet.hizmet_turu
      )
    ORDER BY
      fiyat.tedarikci_id,
      fiyat.stok_id,
      fiyat.fiyat_tarihi DESC,
      fiyat.created_at DESC,
      fiyat.id DESC
  ) son_fiyat
  ON CONFLICT (tedarikci_id, stok_id) DO NOTHING;

  GET DIAGNOSTICS v_eklenen = ROW_COUNT;
  PERFORM set_config(
    'app.tedarikci_stok_baglantisi_rpc',
    COALESCE(v_onceki_rpc, ''),
    true
  );
  RETURN v_eklenen;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.tedarikci_stok_baglantisi_rpc',
    COALESCE(v_onceki_rpc, ''),
    true
  );
  RAISE;
END;
$$;

SELECT public.tedarikci_stok_baglantilarini_fiyatlardan_tamamla();

-- Fiziksel stok fiyat kaydi ve tedarikci-stok baglantisi ayni transactionda
-- olusur. 108 uyumluluguyla acik temper_hizmeti kapsami olmadan kaydedilebilen
-- legacy temper fiyatlari bilerek yeni baglanti yetkisine donusturulmez.
CREATE OR REPLACE FUNCTION
  public.stok_alis_fiyati_tedarikci_baglantisini_tamamla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_onceki_rpc text;
  v_tedarik_kapsamlari text[];
  v_hizmet_turu text;
BEGIN
  IF NEW.tedarikci_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tedarikci.tedarik_kapsamlari, hizmet.hizmet_turu
  INTO v_tedarik_kapsamlari, v_hizmet_turu
  FROM public.cari tedarikci
  JOIN public.stok stok ON stok.id = NEW.stok_id
  LEFT JOIN public.maliyet_hizmet_stoklari hizmet
    ON hizmet.stok_id = stok.id
  WHERE tedarikci.id = NEW.tedarikci_id;

  -- 108'deki tarihsel uyumluluk cam/yan_malzeme tedarikcisinin eski temper
  -- fiyatini kaydetmesine izin verir. Yeni baglanti semantiginde bu aliaslar
  -- yetki sayilmaz; yalniz acik temper_hizmeti kapsami iliski olusturur.
  IF v_hizmet_turu = 'temper_dis_hizmet'
     AND NOT ('temper_hizmeti' = ANY(
       COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])
     )) THEN
    RETURN NEW;
  END IF;

  v_onceki_rpc := current_setting(
    'app.tedarikci_stok_baglantisi_rpc',
    true
  );
  PERFORM set_config(
    'app.tedarikci_stok_baglantisi_rpc',
    'true',
    true
  );

  INSERT INTO public.tedarikci_stok_baglantilari (
    tedarikci_id,
    stok_id,
    marka,
    varsayilan_vade_gunu,
    aciklama,
    aktif,
    revision_no,
    olusturan_kullanici_id,
    son_guncelleyen_kullanici_id
  ) VALUES (
    NEW.tedarikci_id,
    NEW.stok_id,
    NULLIF(btrim(NEW.marka), ''),
    NEW.vade_gunu,
    'Fiyat kaydiyla otomatik olusturuldu.',
    true,
    1,
    auth.uid(),
    auth.uid()
  )
  ON CONFLICT (tedarikci_id, stok_id) DO UPDATE
  SET
    marka = COALESCE(EXCLUDED.marka, tedarikci_stok_baglantilari.marka),
    varsayilan_vade_gunu = EXCLUDED.varsayilan_vade_gunu,
    son_guncelleyen_kullanici_id = auth.uid()
  WHERE tedarikci_stok_baglantilari.aktif
    AND (
      (
        EXCLUDED.marka IS NOT NULL
        AND tedarikci_stok_baglantilari.marka
          IS DISTINCT FROM EXCLUDED.marka
      )
      OR tedarikci_stok_baglantilari.varsayilan_vade_gunu
           IS DISTINCT FROM EXCLUDED.varsayilan_vade_gunu
    );

  PERFORM set_config(
    'app.tedarikci_stok_baglantisi_rpc',
    COALESCE(v_onceki_rpc, ''),
    true
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.tedarikci_stok_baglantisi_rpc',
    COALESCE(v_onceki_rpc, ''),
    true
  );
  RAISE;
END;
$$;

CREATE TRIGGER stok_alis_fiyati_tedarikci_baglantisi
  AFTER INSERT ON public.stok_alis_fiyatlari
  FOR EACH ROW
  WHEN (NEW.tedarikci_id IS NOT NULL)
  EXECUTE FUNCTION
    public.stok_alis_fiyati_tedarikci_baglantisini_tamamla();

-- Aktif iliski varken tedarikci veya stok kartinin iliskiyi gecersiz birakacak
-- sekilde degistirilmesine izin verilmez. Once iliski pasiflestirilir.
CREATE OR REPLACE FUNCTION
  public.tedarikci_stok_baglantilari_cari_degisimini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tedarikci_stok_baglantilari baglanti
    WHERE baglanti.tedarikci_id = OLD.id
      AND baglanti.aktif
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.tipi <> 'tedarikci' OR NOT NEW.aktif THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEDARIKCI_AKTIF_STOK_BAGLANTILARI_VAR';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    LEFT JOIN public.maliyet_hizmet_stoklari hizmet
      ON hizmet.stok_id = stok.id
    WHERE baglanti.tedarikci_id = OLD.id
      AND baglanti.aktif
      AND NOT public.tedarikci_stok_kapsami_uygun(
        NEW.tedarik_kapsamlari,
        stok.kategori,
        hizmet.hizmet_turu
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEDARIKCI_AKTIF_STOK_BAGLANTISI_KAPSAMLA_UYUSMUYOR';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tedarikci_stok_baglantilari_cari_guard
  BEFORE UPDATE OF tipi, aktif, tedarik_kapsamlari ON public.cari
  FOR EACH ROW
  WHEN (
    OLD.tipi IS DISTINCT FROM NEW.tipi
    OR OLD.aktif IS DISTINCT FROM NEW.aktif
    OR OLD.tedarik_kapsamlari IS DISTINCT FROM NEW.tedarik_kapsamlari
  )
  EXECUTE FUNCTION
    public.tedarikci_stok_baglantilari_cari_degisimini_koru();

CREATE OR REPLACE FUNCTION
  public.tedarikci_stok_baglantilari_stok_degisimini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_onceki_rpc text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tedarikci_stok_baglantilari baglanti
    WHERE baglanti.stok_id = OLD.id
      AND baglanti.aktif
  ) THEN
    RETURN NEW;
  END IF;

  -- Stok karti pasiflestirilince iliskiler silinmez; ayni transactionda
  -- revision artirilarak pasiflestirilir. Bu, dis temperden ic uretime gecis
  -- dahil mevcut stok aktiflik akislarini bozmadan butunlugu korur.
  IF OLD.aktif AND NOT NEW.aktif THEN
    v_onceki_rpc := current_setting(
      'app.tedarikci_stok_baglantisi_rpc',
      true
    );
    PERFORM set_config(
      'app.tedarikci_stok_baglantisi_rpc',
      'true',
      true
    );
    BEGIN
      UPDATE public.tedarikci_stok_baglantilari
      SET
        aktif = false,
        son_guncelleyen_kullanici_id = auth.uid()
      WHERE stok_id = OLD.id
        AND aktif;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config(
        'app.tedarikci_stok_baglantisi_rpc',
        COALESCE(v_onceki_rpc, ''),
        true
      );
      RAISE;
    END;
    PERFORM set_config(
      'app.tedarikci_stok_baglantisi_rpc',
      COALESCE(v_onceki_rpc, ''),
      true
    );
    RETURN NEW;
  END IF;

  IF NEW.ticari_kapsam NOT IN ('maliyet_bileseni', 'her_ikisi') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'STOK_AKTIF_TEDARIKCI_BAGLANTILARI_VAR';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.cari tedarikci ON tedarikci.id = baglanti.tedarikci_id
    LEFT JOIN public.maliyet_hizmet_stoklari hizmet
      ON hizmet.stok_id = OLD.id
    WHERE baglanti.stok_id = OLD.id
      AND baglanti.aktif
      AND NOT public.tedarikci_stok_kapsami_uygun(
        tedarikci.tedarik_kapsamlari,
        NEW.kategori,
        hizmet.hizmet_turu
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'STOK_AKTIF_TEDARIKCI_BAGLANTISI_KATEGORIYLE_UYUSMUYOR';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tedarikci_stok_baglantilari_stok_guard
  BEFORE UPDATE OF aktif, kategori, ticari_kapsam ON public.stok
  FOR EACH ROW
  WHEN (
    OLD.aktif IS DISTINCT FROM NEW.aktif
    OR OLD.kategori IS DISTINCT FROM NEW.kategori
    OR OLD.ticari_kapsam IS DISTINCT FROM NEW.ticari_kapsam
  )
  EXECUTE FUNCTION
    public.tedarikci_stok_baglantilari_stok_degisimini_koru();

CREATE OR REPLACE FUNCTION
  public.tedarikci_stok_baglantilarini_getir(p_tedarikci_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tedarikci public.cari%ROWTYPE;
  v_baglantilar jsonb;
  v_adaylar jsonb;
  v_aktif_sayisi integer;
  v_pasif_sayisi integer;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('read', false);

  SELECT * INTO v_tedarikci
  FROM public.cari
  WHERE id = p_tedarikci_id
    AND tipi = 'tedarikci';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'TEDARIKCI_BULUNAMADI';
  END IF;

  SELECT
    count(*) FILTER (WHERE baglanti.aktif)::integer,
    count(*) FILTER (WHERE NOT baglanti.aktif)::integer,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', baglanti.id,
          'tedarikci_id', baglanti.tedarikci_id,
          'stok_id', baglanti.stok_id,
          'stok_kodu', stok.kod,
          'stok_adi', stok.ad,
          'kategori', stok.kategori,
          'ticari_kapsam', stok.ticari_kapsam,
          'birim', stok.birim,
          'hizmet_turu', hizmet.hizmet_turu,
          'marka', baglanti.marka,
          'tedarikci_urun_kodu', baglanti.tedarikci_urun_kodu,
          'varsayilan_vade_gunu', baglanti.varsayilan_vade_gunu,
          'aciklama', baglanti.aciklama,
          'aktif', baglanti.aktif,
          'revision_no', baglanti.revision_no,
          'created_at', baglanti.created_at,
          'updated_at', baglanti.updated_at,
          'son_fiyat', CASE
            WHEN son_fiyat.id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', son_fiyat.id,
              'birim_fiyat', son_fiyat.birim_fiyat,
              'para_birimi', son_fiyat.para_birimi,
              'fiyat_birimi', son_fiyat.fiyat_birimi,
              'fiyat_varyanti', son_fiyat.fiyat_varyanti,
              'marka', son_fiyat.marka,
              'vade_gunu', son_fiyat.vade_gunu,
              'fiyat_tarihi', son_fiyat.fiyat_tarihi,
              'gecerlilik_baslangici', CASE
                WHEN lower_inf(son_fiyat.teklif_gecerlilik_donemi) THEN NULL
                ELSE lower(son_fiyat.teklif_gecerlilik_donemi)
              END,
              'gecerlilik_bitisi', CASE
                WHEN upper_inf(son_fiyat.teklif_gecerlilik_donemi) THEN NULL
                ELSE upper(son_fiyat.teklif_gecerlilik_donemi)
              END,
              'durum', son_fiyat.durum
            )
          END
        )
        ORDER BY
          CASE stok.kategori
            WHEN 'cam' THEN 1
            WHEN 'cita' THEN 2
            ELSE 3
          END,
          stok.kod,
          baglanti.id
      ),
      '[]'::jsonb
    )
  INTO v_aktif_sayisi, v_pasif_sayisi, v_baglantilar
  FROM public.tedarikci_stok_baglantilari baglanti
  JOIN public.stok stok ON stok.id = baglanti.stok_id
  LEFT JOIN public.maliyet_hizmet_stoklari hizmet
    ON hizmet.stok_id = stok.id
  LEFT JOIN LATERAL (
    SELECT fiyat.*
    FROM public.stok_alis_fiyatlari fiyat
    WHERE fiyat.tedarikci_id = baglanti.tedarikci_id
      AND fiyat.stok_id = baglanti.stok_id
    ORDER BY fiyat.fiyat_tarihi DESC, fiyat.created_at DESC, fiyat.id DESC
    LIMIT 1
  ) son_fiyat ON true
  WHERE baglanti.tedarikci_id = p_tedarikci_id;

  IF v_tedarikci.aktif THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'stok_id', stok.id,
          'stok_kodu', stok.kod,
          'stok_adi', stok.ad,
          'kategori', stok.kategori,
          'ticari_kapsam', stok.ticari_kapsam,
          'birim', stok.birim,
          'hizmet_turu', hizmet.hizmet_turu
        )
        ORDER BY
          CASE stok.kategori
            WHEN 'cam' THEN 1
            WHEN 'cita' THEN 2
            ELSE 3
          END,
          stok.kod,
          stok.id
      ),
      '[]'::jsonb
    )
    INTO v_adaylar
    FROM public.stok stok
    LEFT JOIN public.maliyet_hizmet_stoklari hizmet
      ON hizmet.stok_id = stok.id
    WHERE stok.aktif
      AND stok.ticari_kapsam IN ('maliyet_bileseni', 'her_ikisi')
      AND public.tedarikci_stok_kapsami_uygun(
        v_tedarikci.tedarik_kapsamlari,
        stok.kategori,
        hizmet.hizmet_turu
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.tedarikci_stok_baglantilari baglanti
        WHERE baglanti.tedarikci_id = p_tedarikci_id
          AND baglanti.stok_id = stok.id
      );
  ELSE
    v_adaylar := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'tedarikci', jsonb_build_object(
      'id', v_tedarikci.id,
      'kod', v_tedarikci.kod,
      'ad', v_tedarikci.ad,
      'aktif', v_tedarikci.aktif,
      'tedarik_kapsamlari', to_jsonb(v_tedarikci.tedarik_kapsamlari)
    ),
    'baglantilar', v_baglantilar,
    'adaylar', v_adaylar,
    'ozet', jsonb_build_object(
      'aktif_baglanti_sayisi', COALESCE(v_aktif_sayisi, 0),
      'pasif_baglanti_sayisi', COALESCE(v_pasif_sayisi, 0),
      'aday_sayisi', jsonb_array_length(v_adaylar)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tedarikci_stok_baglantisi_kaydet(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_tedarikci_id uuid;
  v_stok_id uuid;
  v_stok_ids uuid[];
  v_beklenen_revision_no bigint;
  v_toplam_stok_sayisi integer;
  v_tekil_stok_sayisi integer;
  v_tedarik_kapsamlari text[];
  v_stok record;
  v_mevcut public.tedarikci_stok_baglantilari%ROWTYPE;
  v_baglanti public.tedarikci_stok_baglantilari%ROWTYPE;
  v_son_fiyat_marka text;
  v_son_fiyat_vade integer;
  v_marka text;
  v_tedarikci_urun_kodu text;
  v_varsayilan_vade_gunu integer;
  v_aciklama text;
  v_onceki_rpc text;
  v_islem text;
  v_baglanti_json jsonb;
  v_baglantilar_json jsonb := '[]'::jsonb;
  v_baglanti_ids_json jsonb := '[]'::jsonb;
  v_alt_payload jsonb;
  v_alt_yanit jsonb;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', true);

  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_PAYLOAD_GECERSIZ';
  END IF;

  IF (p_payload ? 'stok_id') = (p_payload ? 'stok_ids') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEK_STOK_ID_VEYA_STOK_IDS_ZORUNLU';
  END IF;

  -- Toplu secim yalniz aday (henuz hic baglantisi olmayan) stoklari tek
  -- transactionda olusturur. Mevcut/pasif satirlar revision gerektirdiginden
  -- tekil akisla guncellenir veya yeniden etkinlestirilir.
  IF p_payload ? 'stok_ids' THEN
    IF jsonb_typeof(p_payload -> 'stok_ids') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload -> 'stok_ids') = 0
       OR jsonb_array_length(p_payload -> 'stok_ids') > 200 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TOPLU_TEDARIKCI_STOK_LISTESI_GECERSIZ';
    END IF;
    IF p_payload ? 'beklenen_revision_no' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TOPLU_TEDARIKCI_STOK_REVISION_DESTEKLENMIYOR';
    END IF;
    IF p_payload ? 'tedarikci_urun_kodu' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TOPLU_TEDARIKCI_URUN_KODU_DESTEKLENMIYOR',
        DETAIL = 'Tedarikci urun kodu stok bazinda tekil kaydedilmelidir.';
    END IF;

    SELECT
      array_agg(parsed_stok_id ORDER BY parsed_stok_id),
      count(*)::integer,
      count(DISTINCT parsed_stok_id)::integer
    INTO v_stok_ids, v_toplam_stok_sayisi, v_tekil_stok_sayisi
    FROM (
      SELECT value::uuid AS parsed_stok_id
      FROM jsonb_array_elements_text(p_payload -> 'stok_ids')
    ) stok_listesi;

    IF array_position(v_stok_ids, NULL) IS NOT NULL
       OR v_toplam_stok_sayisi <> v_tekil_stok_sayisi THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TOPLU_TEDARIKCI_STOK_LISTESI_TEKIL_OLMALI';
    END IF;

    v_tedarikci_id := NULLIF(p_payload ->> 'tedarikci_id', '')::uuid;
    IF v_tedarikci_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TEDARIKCI_VE_STOK_ZORUNLU';
    END IF;

    v_idempotency := public.ticari_idempotency_baslat(
      'tedarikci_stok_baglantisi_kaydet',
      p_idempotency_key,
      p_payload
    );
    IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
      RETURN v_idempotency -> 'sonuc';
    END IF;
    v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

    SELECT cari.tedarik_kapsamlari
    INTO v_tedarik_kapsamlari
    FROM public.cari cari
    WHERE cari.id = v_tedarikci_id
      AND cari.tipi = 'tedarikci'
      AND cari.aktif
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'AKTIF_TEDARIKCI_BULUNAMADI';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tedarikci_stok_baglantilari baglanti
      WHERE baglanti.tedarikci_id = v_tedarikci_id
        AND baglanti.stok_id = ANY(v_stok_ids)
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'TOPLU_TEDARIKCI_STOK_LISTESINDE_MEVCUT_BAGLANTI_VAR',
        DETAIL = (
          SELECT jsonb_agg(baglanti.stok_id ORDER BY baglanti.stok_id)::text
          FROM public.tedarikci_stok_baglantilari baglanti
          WHERE baglanti.tedarikci_id = v_tedarikci_id
            AND baglanti.stok_id = ANY(v_stok_ids)
        );
    END IF;

    FOREACH v_stok_id IN ARRAY v_stok_ids LOOP
      SELECT
        stok.id,
        stok.kod,
        stok.ad,
        stok.kategori,
        stok.ticari_kapsam,
        stok.birim,
        hizmet.hizmet_turu
      INTO v_stok
      FROM public.stok stok
      LEFT JOIN public.maliyet_hizmet_stoklari hizmet
        ON hizmet.stok_id = stok.id
      WHERE stok.id = v_stok_id
        AND stok.aktif
      FOR UPDATE OF stok;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0002',
          MESSAGE = 'AKTIF_MALIYET_STOGU_BULUNAMADI',
          DETAIL = v_stok_id::text;
      END IF;
      IF v_stok.ticari_kapsam NOT IN ('maliyet_bileseni', 'her_ikisi') THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'TEDARIKCI_STOK_TICARI_KAPSAMI_GECERSIZ',
          DETAIL = v_stok_id::text;
      END IF;
      IF NOT public.tedarikci_stok_kapsami_uygun(
        v_tedarik_kapsamlari,
        v_stok.kategori,
        v_stok.hizmet_turu
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'TEDARIKCI_STOK_KAPSAMI_UYUSMUYOR',
          DETAIL = v_stok_id::text;
      END IF;
    END LOOP;

    FOREACH v_stok_id IN ARRAY v_stok_ids LOOP
      v_alt_payload := (p_payload - 'stok_ids')
        || jsonb_build_object('stok_id', v_stok_id);
      v_alt_yanit := public.tedarikci_stok_baglantisi_kaydet(
        v_alt_payload,
        v_idempotency_id::text || ':' || v_stok_id::text
      );
      v_baglantilar_json := v_baglantilar_json
        || jsonb_build_array(v_alt_yanit -> 'baglanti');
      v_baglanti_ids_json := v_baglanti_ids_json
        || jsonb_build_array(v_alt_yanit #> '{baglanti,id}');
    END LOOP;

    v_yanit := jsonb_build_object(
      'basarili', true,
      'islem', 'toplu_olusturuldu',
      'adet', jsonb_array_length(v_baglantilar_json),
      'baglanti', NULL,
      'baglantilar', v_baglantilar_json,
      'baglanti_ids', v_baglanti_ids_json
    );
    RETURN public.ticari_idempotency_basarili(
      v_idempotency_id,
      v_yanit
    );
  END IF;

  v_tedarikci_id := NULLIF(p_payload ->> 'tedarikci_id', '')::uuid;
  v_stok_id := NULLIF(p_payload ->> 'stok_id', '')::uuid;
  v_beklenen_revision_no := NULLIF(
    p_payload ->> 'beklenen_revision_no',
    ''
  )::bigint;

  IF v_tedarikci_id IS NULL OR v_stok_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEDARIKCI_VE_STOK_ZORUNLU';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_stok_baglantisi_kaydet',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  SELECT cari.tedarik_kapsamlari
  INTO v_tedarik_kapsamlari
  FROM public.cari cari
  WHERE cari.id = v_tedarikci_id
    AND cari.tipi = 'tedarikci'
    AND cari.aktif
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'AKTIF_TEDARIKCI_BULUNAMADI';
  END IF;

  SELECT
    stok.id,
    stok.kod,
    stok.ad,
    stok.kategori,
    stok.ticari_kapsam,
    stok.birim,
    hizmet.hizmet_turu
  INTO v_stok
  FROM public.stok stok
  LEFT JOIN public.maliyet_hizmet_stoklari hizmet
    ON hizmet.stok_id = stok.id
  WHERE stok.id = v_stok_id
    AND stok.aktif
  FOR UPDATE OF stok;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'AKTIF_MALIYET_STOGU_BULUNAMADI';
  END IF;

  IF v_stok.ticari_kapsam NOT IN ('maliyet_bileseni', 'her_ikisi') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEDARIKCI_STOK_TICARI_KAPSAMI_GECERSIZ';
  END IF;

  IF NOT public.tedarikci_stok_kapsami_uygun(
    v_tedarik_kapsamlari,
    v_stok.kategori,
    v_stok.hizmet_turu
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEDARIKCI_STOK_KAPSAMI_UYUSMUYOR';
  END IF;

  SELECT fiyat.marka, fiyat.vade_gunu
  INTO v_son_fiyat_marka, v_son_fiyat_vade
  FROM public.stok_alis_fiyatlari fiyat
  WHERE fiyat.tedarikci_id = v_tedarikci_id
    AND fiyat.stok_id = v_stok_id
  ORDER BY fiyat.fiyat_tarihi DESC, fiyat.created_at DESC, fiyat.id DESC
  LIMIT 1;

  SELECT * INTO v_mevcut
  FROM public.tedarikci_stok_baglantilari baglanti
  WHERE baglanti.tedarikci_id = v_tedarikci_id
    AND baglanti.stok_id = v_stok_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_beklenen_revision_no IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_REVISION_GEREKLI';
    END IF;
    IF v_mevcut.revision_no <> v_beklenen_revision_no THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_REVISION_CAKISMASI';
    END IF;

    v_marka := CASE
      WHEN p_payload ? 'marka'
        THEN NULLIF(btrim(p_payload ->> 'marka'), '')
      ELSE v_mevcut.marka
    END;
    v_tedarikci_urun_kodu := CASE
      WHEN p_payload ? 'tedarikci_urun_kodu'
        THEN NULLIF(btrim(p_payload ->> 'tedarikci_urun_kodu'), '')
      ELSE v_mevcut.tedarikci_urun_kodu
    END;
    v_varsayilan_vade_gunu := CASE
      WHEN p_payload ? 'varsayilan_vade_gunu'
        THEN NULLIF(p_payload ->> 'varsayilan_vade_gunu', '')::integer
      ELSE v_mevcut.varsayilan_vade_gunu
    END;
    v_aciklama := CASE
      WHEN p_payload ? 'aciklama'
        THEN NULLIF(btrim(p_payload ->> 'aciklama'), '')
      ELSE v_mevcut.aciklama
    END;
  ELSE
    IF v_beklenen_revision_no IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'YENI_TEDARIKCI_STOK_BAGLANTISINDA_REVISION_OLMAMALI';
    END IF;
    v_marka := CASE
      WHEN p_payload ? 'marka'
        THEN NULLIF(btrim(p_payload ->> 'marka'), '')
      ELSE NULLIF(btrim(v_son_fiyat_marka), '')
    END;
    v_tedarikci_urun_kodu := NULLIF(
      btrim(p_payload ->> 'tedarikci_urun_kodu'),
      ''
    );
    v_varsayilan_vade_gunu := CASE
      WHEN p_payload ? 'varsayilan_vade_gunu'
        THEN NULLIF(p_payload ->> 'varsayilan_vade_gunu', '')::integer
      ELSE v_son_fiyat_vade
    END;
    v_aciklama := NULLIF(btrim(p_payload ->> 'aciklama'), '');
  END IF;

  IF length(COALESCE(v_marka, '')) > 200
     OR length(COALESCE(v_tedarikci_urun_kodu, '')) > 120
     OR length(COALESCE(v_aciklama, '')) > 2000
     OR (
       v_varsayilan_vade_gunu IS NOT NULL
       AND v_varsayilan_vade_gunu NOT BETWEEN 0 AND 3650
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_METADATA_GECERSIZ';
  END IF;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_stok_baglantisi_kaydet',
    p_idempotency_key,
    COALESCE(
      NULLIF(btrim(p_payload ->> 'gerekce'), ''),
      'Tedarikci stok baglantisi kaydi'
    ),
    COALESCE(
      NULLIF(btrim(p_payload ->> 'kaynak_ekran'), ''),
      'cari_tedarikci_detayi'
    )
  );

  IF v_mevcut.id IS NULL THEN
    v_onceki_rpc := current_setting(
      'app.tedarikci_stok_baglantisi_rpc',
      true
    );
    PERFORM set_config(
      'app.tedarikci_stok_baglantisi_rpc',
      'true',
      true
    );
    BEGIN
      INSERT INTO public.tedarikci_stok_baglantilari (
        tedarikci_id,
        stok_id,
        marka,
        tedarikci_urun_kodu,
        varsayilan_vade_gunu,
        aciklama,
        aktif,
        revision_no,
        olusturan_kullanici_id,
        son_guncelleyen_kullanici_id
      ) VALUES (
        v_tedarikci_id,
        v_stok_id,
        v_marka,
        v_tedarikci_urun_kodu,
        v_varsayilan_vade_gunu,
        v_aciklama,
        true,
        1,
        auth.uid(),
        auth.uid()
      )
      RETURNING * INTO v_baglanti;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_ESZAMANLI_OLUSTURULDU';
    END;
    PERFORM set_config(
      'app.tedarikci_stok_baglantisi_rpc',
      COALESCE(v_onceki_rpc, ''),
      true
    );
    v_islem := 'olusturuldu';
  ELSIF v_mevcut.aktif
      AND v_mevcut.marka IS NOT DISTINCT FROM v_marka
      AND v_mevcut.tedarikci_urun_kodu
        IS NOT DISTINCT FROM v_tedarikci_urun_kodu
      AND v_mevcut.varsayilan_vade_gunu
        IS NOT DISTINCT FROM v_varsayilan_vade_gunu
      AND v_mevcut.aciklama IS NOT DISTINCT FROM v_aciklama THEN
    v_baglanti := v_mevcut;
    v_islem := 'degismedi';
  ELSE
    v_onceki_rpc := current_setting(
      'app.tedarikci_stok_baglantisi_rpc',
      true
    );
    PERFORM set_config(
      'app.tedarikci_stok_baglantisi_rpc',
      'true',
      true
    );
    UPDATE public.tedarikci_stok_baglantilari
    SET
      marka = v_marka,
      tedarikci_urun_kodu = v_tedarikci_urun_kodu,
      varsayilan_vade_gunu = v_varsayilan_vade_gunu,
      aciklama = v_aciklama,
      aktif = true,
      son_guncelleyen_kullanici_id = auth.uid()
    WHERE id = v_mevcut.id
    RETURNING * INTO v_baglanti;
    PERFORM set_config(
      'app.tedarikci_stok_baglantisi_rpc',
      COALESCE(v_onceki_rpc, ''),
      true
    );
    v_islem := CASE
      WHEN v_mevcut.aktif THEN 'guncellendi'
      ELSE 'yeniden_etkinlestirildi'
    END;
  END IF;

  SELECT jsonb_build_object(
    'id', baglanti.id,
    'tedarikci_id', baglanti.tedarikci_id,
    'stok_id', baglanti.stok_id,
    'stok_kodu', stok.kod,
    'stok_adi', stok.ad,
    'kategori', stok.kategori,
    'ticari_kapsam', stok.ticari_kapsam,
    'birim', stok.birim,
    'hizmet_turu', hizmet.hizmet_turu,
    'marka', baglanti.marka,
    'tedarikci_urun_kodu', baglanti.tedarikci_urun_kodu,
    'varsayilan_vade_gunu', baglanti.varsayilan_vade_gunu,
    'aciklama', baglanti.aciklama,
    'aktif', baglanti.aktif,
    'revision_no', baglanti.revision_no,
    'created_at', baglanti.created_at,
    'updated_at', baglanti.updated_at
  )
  INTO v_baglanti_json
  FROM public.tedarikci_stok_baglantilari baglanti
  JOIN public.stok stok ON stok.id = baglanti.stok_id
  LEFT JOIN public.maliyet_hizmet_stoklari hizmet
    ON hizmet.stok_id = stok.id
  WHERE baglanti.id = v_baglanti.id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'islem', v_islem,
    'adet', 1,
    'baglanti', v_baglanti_json,
    'baglantilar', jsonb_build_array(v_baglanti_json),
    'baglanti_ids', jsonb_build_array(v_baglanti.id)
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
EXCEPTION WHEN OTHERS THEN
  IF v_onceki_rpc IS NOT NULL THEN
    PERFORM set_config(
      'app.tedarikci_stok_baglantisi_rpc',
      v_onceki_rpc,
      true
    );
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.tedarikci_stok_baglantisi_pasiflestir(
  p_baglanti_id uuid,
  p_beklenen_revision_no bigint,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_baglanti public.tedarikci_stok_baglantilari%ROWTYPE;
  v_onceki_rpc text;
  v_islem text;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);

  IF p_baglanti_id IS NULL OR p_beklenen_revision_no IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_REVISION_GEREKLI';
  END IF;
  IF length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_GEREKCESI_ZORUNLU';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_stok_baglantisi_pasiflestir',
    p_idempotency_key,
    jsonb_build_object(
      'baglanti_id', p_baglanti_id,
      'beklenen_revision_no', p_beklenen_revision_no,
      'gerekce', btrim(p_gerekce)
    )
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  SELECT * INTO v_baglanti
  FROM public.tedarikci_stok_baglantilari
  WHERE id = p_baglanti_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_BULUNAMADI';
  END IF;
  IF v_baglanti.revision_no <> p_beklenen_revision_no THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'TEDARIKCI_STOK_BAGLANTISI_REVISION_CAKISMASI';
  END IF;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_stok_baglantisi_pasiflestir',
    p_idempotency_key,
    p_gerekce,
    'cari_tedarikci_detayi'
  );

  IF v_baglanti.aktif THEN
    v_onceki_rpc := current_setting(
      'app.tedarikci_stok_baglantisi_rpc',
      true
    );
    PERFORM set_config(
      'app.tedarikci_stok_baglantisi_rpc',
      'true',
      true
    );
    UPDATE public.tedarikci_stok_baglantilari
    SET
      aktif = false,
      son_guncelleyen_kullanici_id = auth.uid()
    WHERE id = p_baglanti_id
    RETURNING * INTO v_baglanti;
    PERFORM set_config(
      'app.tedarikci_stok_baglantisi_rpc',
      COALESCE(v_onceki_rpc, ''),
      true
    );
    v_islem := 'pasiflestirildi';
  ELSE
    v_islem := 'zaten_pasif';
  END IF;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'islem', v_islem,
    'baglanti_id', v_baglanti.id,
    'tedarikci_id', v_baglanti.tedarikci_id,
    'stok_id', v_baglanti.stok_id,
    'aktif', v_baglanti.aktif,
    'revision_no', v_baglanti.revision_no
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
EXCEPTION WHEN OTHERS THEN
  IF v_onceki_rpc IS NOT NULL THEN
    PERFORM set_config(
      'app.tedarikci_stok_baglantisi_rpc',
      v_onceki_rpc,
      true
    );
  END IF;
  RAISE;
END;
$$;

ALTER TABLE public.tedarikci_stok_baglantilari
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tedarikci_stok_baglantilari
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.tedarikci_stok_baglantilari
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tedarikci_stok_baglantilari TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.tedarikci_stok_baglantilari TO service_role;

CREATE POLICY tedarikci_stok_baglantilari_costing_read
  ON public.tedarikci_stok_baglantilari
  FOR SELECT TO authenticated
  USING (public.has_permission('costing', 'read'));

CREATE TRIGGER audit_tedarikci_stok_baglantilari
  AFTER INSERT OR UPDATE OR DELETE
  ON public.tedarikci_stok_baglantilari
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

REVOKE ALL ON FUNCTION public.tedarikci_stok_kapsami_uygun(
  text[], text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tedarikci_stok_baglantisi_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.tedarikci_stok_baglantilarini_fiyatlardan_tamamla()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.stok_alis_fiyati_tedarikci_baglantisini_tamamla()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.tedarikci_stok_baglantilari_cari_degisimini_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.tedarikci_stok_baglantilari_stok_degisimini_koru()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.tedarikci_stok_baglantilarini_getir(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION
  public.tedarikci_stok_baglantisi_kaydet(jsonb, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION
  public.tedarikci_stok_baglantisi_pasiflestir(uuid, bigint, text, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.tedarikci_stok_baglantilarini_getir(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.tedarikci_stok_baglantisi_kaydet(jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.tedarikci_stok_baglantisi_pasiflestir(uuid, bigint, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.tedarikci_stok_baglantilarini_getir(uuid) IS
  'Tedarikcinin aktif/pasif stok baglantilarini, son fiyatlarini ve yalniz kendi kapsamina uyan eklenebilir maliyet stoklarini getirir.';
COMMENT ON FUNCTION public.tedarikci_stok_baglantisi_kaydet(jsonb, text) IS
  'AAL2 ve costing.update ile tedarikci-stok baglantisini iyimser kilit ve idempotency kullanarak olusturur, gunceller veya yeniden etkinlestirir.';
COMMENT ON FUNCTION public.tedarikci_stok_baglantisi_pasiflestir(
  uuid, bigint, text, text
) IS
  'AAL2 ve costing.manage ile tedarikci-stok baglantisini silmeden pasiflestirir.';

COMMIT;
