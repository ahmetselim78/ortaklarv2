from __future__ import annotations

import argparse
from pathlib import Path

import openpyxl


PERSONEL = {
    "Ahmet": "1dd2e84d-4ef7-45aa-ac0f-2c948ea2c3d2",  # Ahmet Selim Özsabuncu
    "Aysel": "c8aa995f-223b-4627-aad5-af104c29a1d5",  # Aysel Türkoğlu
    "Ersin": "3afc13d0-f58a-4245-a52a-e32e2beedfed",  # Ersin Oğraşaner
    "Hami": "c37f1d51-c24a-4a78-b7c3-9a8c400bdabb",   # Hami Taş
    "Selma": "668734d8-e6cf-4a0c-ab31-2e02ed0583b9",  # Selma Bulut
    "Tolga": "6b65b1c1-4d9e-42ea-a6c5-8165e1f0419a",  # Tolga Özsabuncu
}


def sql_text(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def number(value: object) -> int:
    return int(value or 0)


def main() -> None:
    parser = argparse.ArgumentParser(description="Excel'den Supabase SQL aktarım betiği oluşturur.")
    parser.add_argument("xlsx", type=Path)
    parser.add_argument("sql", type=Path)
    args = parser.parse_args()

    workbook = openpyxl.load_workbook(args.xlsx, read_only=True, data_only=True)
    values: list[str] = []
    source_rows = 0

    for sheet in workbook.worksheets:
        for row in sheet.iter_rows(min_row=2, values_only=True):
            if not row[0]:
                continue
            source_rows += 1
            operator = str(row[1] or "").strip()
            operator_id = PERSONEL.get(operator)
            if not operator_id:
                raise ValueError(f"Eşleşmeyen operatör: {operator!r} ({sheet.title}, {row[0]})")
            date_parts = str(row[0]).split(".")
            if len(date_parts) != 3:
                raise ValueError(f"Geçersiz tarih: {row[0]!r} ({sheet.title})")
            iso_date = f"{date_parts[2]}-{date_parts[1]}-{date_parts[0]}"
            fields = [
                sql_text(iso_date), sql_text(operator_id),
                str(number(row[2])), str(number(row[3])), str(number(row[4])),
                str(number(row[5])), str(number(row[6])), str(number(row[7])),
                str(number(row[8])), str(number(row[9])), str(number(row[10])),
                str(number(row[11])), str(number(row[12])), str(number(row[13])),
                sql_text(str(row[14] or "").strip()) if str(row[14] or "").strip() else "NULL",
            ]
            values.append("  (" + ", ".join(fields) + ")")

    if not values:
        raise ValueError("Excel'de aktarılacak satır bulunamadı.")

    sql = f"""-- Uretim_Raporu_2026.xlsx aktarımı
-- Kaynak: {source_rows} Excel satırı. Aynı tarih + operatör tekrarları birleştirilir.
-- Güvenli tekrar çalıştırma: bu aktarımın istasyon ve araç kayıtları güncellenir,
-- diğer araç kayıtlarına dokunulmaz.
-- Not: Excel'deki 'Ahmet', Ahmet Selim Özsabuncu olarak eşleştirildi.

BEGIN;

-- Aktif istasyonların adları bu isimlerle birebir aynı olmalıdır.
DO $$
DECLARE eksik text;
BEGIN
  SELECT string_agg(ad, ', ') INTO eksik
  FROM (VALUES
    ('Kesim'), ('Çıta Büküm'), ('Çıta Kesim'), ('Isıcam Hattı'), ('Robot'), ('Tamir')
  ) AS gerekli(ad)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.uretim_istasyonlari i WHERE i.ad = gerekli.ad
  );
  IF eksik IS NOT NULL THEN
    RAISE EXCEPTION 'Eksik veya farklı adlandırılmış istasyon: %', eksik;
  END IF;
END $$;

CREATE TEMP TABLE _excel_ham (
  tarih date NOT NULL,
  operator_id uuid NOT NULL,
  kesim integer NOT NULL,
  cita_bukum integer NOT NULL,
  cita_kesim integer NOT NULL,
  isicam_hatti integer NOT NULL,
  robot integer NOT NULL,
  robot_fire integer NOT NULL,
  tamir integer NOT NULL,
  tir integer NOT NULL,
  kamyon integer NOT NULL,
  kamyonet_kia integer NOT NULL,
  kamyonet_isuzu integer NOT NULL,
  toplam_personel integer NOT NULL,
  notlar text
) ON COMMIT DROP;

INSERT INTO _excel_ham VALUES
{',\n'.join(values)};

CREATE TEMP TABLE _excel_ozet ON COMMIT DROP AS
SELECT
  tarih,
  operator_id,
  SUM(kesim)::integer AS kesim,
  SUM(cita_bukum)::integer AS cita_bukum,
  SUM(cita_kesim)::integer AS cita_kesim,
  SUM(isicam_hatti)::integer AS isicam_hatti,
  SUM(robot)::integer AS robot,
  SUM(robot_fire)::integer AS robot_fire,
  SUM(tamir)::integer AS tamir,
  SUM(tir)::integer AS tir,
  SUM(kamyon)::integer AS kamyon,
  SUM(kamyonet_kia)::integer AS kamyonet_kia,
  SUM(kamyonet_isuzu)::integer AS kamyonet_isuzu,
  MAX(toplam_personel)::integer AS toplam_personel,
  string_agg(DISTINCT NULLIF(btrim(notlar), ''), E'\\n---\\n') AS notlar
FROM _excel_ham
GROUP BY tarih, operator_id;

INSERT INTO public.gunluk_uretim_raporlari (
  tarih, operator_id, toplam_personel, notlar, updated_at
)
SELECT tarih, operator_id, toplam_personel, notlar, now()
FROM _excel_ozet
ON CONFLICT (tarih, operator_id) DO UPDATE SET
  toplam_personel = EXCLUDED.toplam_personel,
  notlar = EXCLUDED.notlar,
  updated_at = now();

CREATE TEMP TABLE _aktarilan_raporlar ON COMMIT DROP AS
SELECT r.id, o.*
FROM _excel_ozet o
JOIN public.gunluk_uretim_raporlari r
  ON r.tarih = o.tarih AND r.operator_id = o.operator_id;

INSERT INTO public.gunluk_uretim_istasyon_kayitlari (
  rapor_id, istasyon_id, adet, fire_adet
)
SELECT
  r.id,
  i.id,
  v.adet,
  v.fire_adet
FROM _aktarilan_raporlar r
CROSS JOIN LATERAL (VALUES
  ('Kesim', r.kesim, 0),
  ('Çıta Büküm', r.cita_bukum, 0),
  ('Çıta Kesim', r.cita_kesim, 0),
  ('Isıcam Hattı', r.isicam_hatti, 0),
  ('Robot', r.robot, r.robot_fire),
  ('Tamir', r.tamir, 0)
) AS v(istasyon_adi, adet, fire_adet)
JOIN public.uretim_istasyonlari i ON i.ad = v.istasyon_adi
ON CONFLICT (rapor_id, istasyon_id) DO UPDATE SET
  adet = EXCLUDED.adet,
  fire_adet = EXCLUDED.fire_adet;

-- Bu dört satır yalnızca bu Excel aktarımının araç kategorileridir.
DELETE FROM public.gunluk_uretim_arac_yuklemeleri y
USING _aktarilan_raporlar r
WHERE y.rapor_id = r.id
  AND y.dis_arac_plakasi IN ('EXCEL-TIR', 'EXCEL-KAMYON', 'EXCEL-KIA', 'EXCEL-ISUZU');

INSERT INTO public.gunluk_uretim_arac_yuklemeleri (
  rapor_id, arac_id, dis_arac_plakasi, dis_arac_adi, adet
)
SELECT r.id, NULL, v.kod, v.ad, v.adet
FROM _aktarilan_raporlar r
CROSS JOIN LATERAL (VALUES
  ('EXCEL-TIR', 'Tır', r.tir),
  ('EXCEL-KAMYON', 'Kamyon', r.kamyon),
  ('EXCEL-KIA', 'Kamyonet (Kia)', r.kamyonet_kia),
  ('EXCEL-ISUZU', 'Kamyonet (Isuzu)', r.kamyonet_isuzu)
) AS v(kod, ad, adet)
WHERE v.adet > 0;

-- Kontrol: 302 benzersiz tarih + operatör raporu dönmelidir.
SELECT count(*) AS aktarilan_rapor_sayisi
FROM _excel_ozet;

COMMIT;
"""

    args.sql.write_text(sql, encoding="utf-8")
    print(f"{args.sql}: {source_rows} kaynak satır")


if __name__ == "__main__":
    main()
