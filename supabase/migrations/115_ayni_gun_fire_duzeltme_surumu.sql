-- 115 - Ayni gun stok fire oranini audit izini koruyarak duzeltme
--
-- Fire surumleri gun cozumurluklu daterange kullandigi icin, ayni baslangic
-- gununde ikinci kez kaydedilen oran onceki satiri [gun, gun) araligina
-- kisaltamiyordu. Bu migration oran satirini silmeden veya oranini yerinde
-- degistirmeden "yerine gecilmis" olarak saklar ve yeni revision'i ayni gunde
-- etkinlestirir.

ALTER TABLE public.stok_fire_orani_surmleri
  ADD COLUMN yerine_gecilen_gecerlilik_donemi daterange,
  ADD COLUMN yerine_gecen_fire_surumu_id uuid,
  ADD COLUMN yerine_gecme_tarihi date,
  ADD COLUMN yerine_gecme_zamani timestamptz,
  ADD COLUMN yerine_gecme_gerekcesi text,
  ADD COLUMN yerine_gecme_idempotency_id uuid,
  ADD COLUMN yerine_geciren_kullanici_id uuid;

ALTER TABLE public.stok_fire_orani_surmleri
  ADD CONSTRAINT stok_fire_orani_yerine_gecen_fk
    FOREIGN KEY (yerine_gecen_fire_surumu_id)
    REFERENCES public.stok_fire_orani_surmleri(id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT stok_fire_orani_yerine_gecen_tekil
    UNIQUE (yerine_gecen_fire_surumu_id),
  ADD CONSTRAINT stok_fire_orani_yerine_gecme_idempotency_fk
    FOREIGN KEY (yerine_gecme_idempotency_id)
    REFERENCES public.islem_idempotency(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT stok_fire_orani_yerine_gecme_idempotency_tekil
    UNIQUE (yerine_gecme_idempotency_id),
  ADD CONSTRAINT stok_fire_orani_yerine_geciren_fk
    FOREIGN KEY (yerine_geciren_kullanici_id)
    REFERENCES public.app_users(auth_user_id)
    ON DELETE RESTRICT;

DO $$
DECLARE
  v_constraint_name text;
  v_found boolean := false;
BEGIN
  FOR v_constraint_name IN
    SELECT con.conname
    FROM pg_catalog.pg_constraint con
    WHERE con.conrelid = 'public.stok_fire_orani_surmleri'::regclass
      AND con.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(con.oid)
        LIKE '%NOT isempty(gecerlilik_donemi)%'
      AND pg_catalog.pg_get_constraintdef(con.oid)
        LIKE '%lower_inf(gecerlilik_donemi)%'
  LOOP
    v_found := true;
    EXECUTE format(
      'ALTER TABLE public.stok_fire_orani_surmleri DROP CONSTRAINT %I',
      v_constraint_name
    );
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION USING
      ERRCODE = '42704',
      MESSAGE = 'STOK_FIRE_GECERLILIK_KISITI_BULUNAMADI';
  END IF;
END;
$$;

ALTER TABLE public.stok_fire_orani_surmleri
  ADD CONSTRAINT stok_fire_orani_gecerlilik_ve_yerine_gecme_check
  CHECK (
    (
      NOT isempty(gecerlilik_donemi)
      AND (lower_inf(gecerlilik_donemi) OR lower_inc(gecerlilik_donemi))
      AND NOT upper_inc(gecerlilik_donemi)
      AND num_nonnulls(
        yerine_gecilen_gecerlilik_donemi,
        yerine_gecen_fire_surumu_id,
        yerine_gecme_tarihi,
        yerine_gecme_zamani,
        yerine_gecme_gerekcesi,
        yerine_gecme_idempotency_id,
        yerine_geciren_kullanici_id
      ) = 0
    )
    OR
    (
      isempty(gecerlilik_donemi)
      AND NOT isempty(yerine_gecilen_gecerlilik_donemi)
      AND yerine_gecen_fire_surumu_id <> id
      AND length(btrim(yerine_gecme_gerekcesi)) >= 1
      AND num_nonnulls(
        yerine_gecilen_gecerlilik_donemi,
        yerine_gecen_fire_surumu_id,
        yerine_gecme_tarihi,
        yerine_gecme_zamani,
        yerine_gecme_gerekcesi,
        yerine_gecme_idempotency_id,
        yerine_geciren_kullanici_id
      ) = 7
    )
  );

CREATE OR REPLACE FUNCTION public.stok_fire_orani_surumu_degisimini_koru_v3()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MALIYET_V3_SURUMU_SILINEMEZ';
  END IF;

  -- Gun cozumurlugunde ayni baslangictaki bir duzeltme onceki satirin
  -- yalniz donemini bosaltabilir. Oran, revision ve olusturma bilgileri
  -- degistirilemez; onceki donem ve yeni revision baglantisi satirda kalir.
  IF current_setting(
       'app.maliyet_v3_fire_ayni_gun_yerine_gecme',
       true
     ) = 'true'
     AND NOT isempty(OLD.gecerlilik_donemi)
     AND isempty(NEW.gecerlilik_donemi)
     AND NEW.yerine_gecilen_gecerlilik_donemi
       = OLD.gecerlilik_donemi
     AND NEW.yerine_gecme_tarihi
       = lower(OLD.gecerlilik_donemi)
     AND OLD.yerine_gecen_fire_surumu_id IS NULL
     AND NEW.yerine_gecen_fire_surumu_id IS NOT NULL
     AND (
       to_jsonb(OLD) - ARRAY[
         'gecerlilik_donemi',
         'yerine_gecilen_gecerlilik_donemi',
         'yerine_gecen_fire_surumu_id',
         'yerine_gecme_tarihi',
         'yerine_gecme_zamani',
         'yerine_gecme_gerekcesi',
         'yerine_gecme_idempotency_id',
         'yerine_geciren_kullanici_id'
       ]::text[]
     ) = (
       to_jsonb(NEW) - ARRAY[
         'gecerlilik_donemi',
         'yerine_gecilen_gecerlilik_donemi',
         'yerine_gecen_fire_surumu_id',
         'yerine_gecme_tarihi',
         'yerine_gecme_zamani',
         'yerine_gecme_gerekcesi',
         'yerine_gecme_idempotency_id',
         'yerine_geciren_kullanici_id'
       ]::text[]
     ) THEN
    RETURN NEW;
  END IF;

  -- Normal surum kapatma kurali degismez: yalniz ust sinir kisaltilabilir.
  IF current_setting('app.maliyet_v3_surum_kapatma', true)
       IS DISTINCT FROM 'true'
     OR isempty(OLD.gecerlilik_donemi)
     OR isempty(NEW.gecerlilik_donemi)
     OR (to_jsonb(OLD) - 'gecerlilik_donemi')
        IS DISTINCT FROM (to_jsonb(NEW) - 'gecerlilik_donemi')
     OR lower(OLD.gecerlilik_donemi)
        IS DISTINCT FROM lower(NEW.gecerlilik_donemi)
     OR upper_inf(NEW.gecerlilik_donemi)
     OR (
       NOT upper_inf(OLD.gecerlilik_donemi)
       AND upper(NEW.gecerlilik_donemi) >= upper(OLD.gecerlilik_donemi)
     )
     OR upper(NEW.gecerlilik_donemi) <= lower(NEW.gecerlilik_donemi) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MALIYET_V3_SURUMU_DEGISTIRILEMEZ';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER stok_fire_orani_surumu_guard_v3
  ON public.stok_fire_orani_surmleri;

CREATE TRIGGER stok_fire_orani_surumu_guard_v3
  BEFORE UPDATE OR DELETE ON public.stok_fire_orani_surmleri
  FOR EACH ROW
  EXECUTE FUNCTION public.stok_fire_orani_surumu_degisimini_koru_v3();

CREATE OR REPLACE FUNCTION public.stok_fire_orani_kaydet_v3(
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
  v_stok_id uuid := NULLIF(p_payload ->> 'stok_id', '')::uuid;
  v_baslangic date := COALESCE(
    NULLIF(p_payload ->> 'baslangic', '')::date,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_istenen_bitis date := NULLIF(p_payload ->> 'bitis', '')::date;
  v_sonraki_baslangic date;
  v_bitis date;
  v_mevcut public.stok_fire_orani_surmleri%ROWTYPE;
  v_id uuid := gen_random_uuid();
  v_duzeltilen_id uuid;
  v_revision integer;
  v_yanit jsonb;
  v_gerekce text := COALESCE(
    NULLIF(btrim(p_payload ->> 'aciklama'), ''),
    'Ayni gun stok fire orani duzeltmesi'
  );
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', false);

  IF NOT EXISTS (
    SELECT 1 FROM public.stok WHERE id = v_stok_id AND aktif
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AKTIF_STOK_BULUNAMADI';
  END IF;
  IF (p_payload ->> 'fire_orani')::numeric < 0
     OR (p_payload ->> 'fire_orani')::numeric >= 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FIRE_ORANI_GECERSIZ';
  END IF;
  IF v_istenen_bitis IS NOT NULL AND v_istenen_bitis <= v_baslangic THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FIRE_DONEMI_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'stok_fire_orani_kaydet_v3', p_idempotency_key, p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'stok_fire_orani_kaydet_v3',
    p_idempotency_key,
    v_gerekce,
    COALESCE(p_payload ->> 'kaynak_ekran', 'maliyet_v3')
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('stok_fire_v3:' || v_stok_id::text, 0)
  );

  SELECT *
  INTO v_mevcut
  FROM public.stok_fire_orani_surmleri
  WHERE stok_id = v_stok_id
    AND gecerlilik_donemi @> v_baslangic
  FOR UPDATE;

  IF FOUND THEN
    IF lower(v_mevcut.gecerlilik_donemi) = v_baslangic THEN
      v_duzeltilen_id := v_mevcut.id;
      PERFORM set_config(
        'app.maliyet_v3_fire_ayni_gun_yerine_gecme',
        'true',
        true
      );
      UPDATE public.stok_fire_orani_surmleri
      SET gecerlilik_donemi = 'empty'::daterange,
          yerine_gecilen_gecerlilik_donemi =
            v_mevcut.gecerlilik_donemi,
          yerine_gecen_fire_surumu_id = v_id,
          yerine_gecme_tarihi = v_baslangic,
          yerine_gecme_zamani = clock_timestamp(),
          yerine_gecme_gerekcesi = v_gerekce,
          yerine_gecme_idempotency_id = v_idempotency_id,
          yerine_geciren_kullanici_id = auth.uid()
      WHERE id = v_mevcut.id;
      PERFORM set_config(
        'app.maliyet_v3_fire_ayni_gun_yerine_gecme',
        'false',
        true
      );
    ELSE
      PERFORM set_config('app.maliyet_v3_surum_kapatma', 'true', true);
      UPDATE public.stok_fire_orani_surmleri
      SET gecerlilik_donemi =
        daterange(lower(gecerlilik_donemi), v_baslangic, '[)')
      WHERE id = v_mevcut.id;
    END IF;
  END IF;

  SELECT min(lower(gecerlilik_donemi))
  INTO v_sonraki_baslangic
  FROM public.stok_fire_orani_surmleri
  WHERE stok_id = v_stok_id
    AND lower(gecerlilik_donemi) > v_baslangic;

  v_bitis := CASE
    WHEN v_istenen_bitis IS NULL THEN v_sonraki_baslangic
    WHEN v_sonraki_baslangic IS NULL THEN v_istenen_bitis
    ELSE LEAST(v_istenen_bitis, v_sonraki_baslangic)
  END;
  v_revision := COALESCE((
    SELECT max(revision_no) + 1
    FROM public.stok_fire_orani_surmleri
    WHERE stok_id = v_stok_id
  ), 1);

  INSERT INTO public.stok_fire_orani_surmleri (
    id,
    stok_id,
    fire_orani,
    gecerlilik_donemi,
    revision_no,
    aciklama,
    olusturan_kullanici_id
  )
  VALUES (
    v_id,
    v_stok_id,
    (p_payload ->> 'fire_orani')::numeric,
    daterange(v_baslangic, v_bitis, '[)'),
    v_revision,
    NULLIF(p_payload ->> 'aciklama', ''),
    auth.uid()
  );

  v_yanit := jsonb_build_object(
    'basarili', true,
    'fire_surumu_id', v_id,
    'duzeltilen_fire_surumu_id', v_duzeltilen_id,
    'stok_id', v_stok_id,
    'fire_orani', (p_payload ->> 'fire_orani')::numeric,
    'gecerlilik_baslangici', v_baslangic,
    'gecerlilik_bitisi', v_bitis,
    'revision_no', v_revision
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

REVOKE ALL ON FUNCTION public.stok_fire_orani_surumu_degisimini_koru_v3()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stok_fire_orani_kaydet_v3(jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stok_fire_orani_kaydet_v3(jsonb, text)
  TO authenticated;

COMMENT ON FUNCTION public.stok_fire_orani_surumu_degisimini_koru_v3() IS
  'Fire surumlerinde normal ust-sinir kapatmasini ve RPC kontrollu ayni-gun yerine gecmeyi sinirlar.';
COMMENT ON FUNCTION public.stok_fire_orani_kaydet_v3(jsonb, text) IS
  'Stok fire oranini surumler; ayni baslangic gunundeki duzeltmede onceki revision ve audit izini korur.';
COMMENT ON COLUMN public.stok_fire_orani_surmleri.yerine_gecilen_gecerlilik_donemi IS
  'Ayni gun duzeltmesinde empty yapilmadan onceki tarihsel donemin tam kopyasi.';
COMMENT ON COLUMN public.stok_fire_orani_surmleri.yerine_gecen_fire_surumu_id IS
  'Bu revision yerine ayni gun etkinlesen yeni fire revision kimligi.';
