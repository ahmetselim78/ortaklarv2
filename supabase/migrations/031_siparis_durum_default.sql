-- Yeni siparislerin batch listesine girebilmesi icin durum varsayilanini sabitle.
UPDATE siparisler
SET durum = 'beklemede'
WHERE durum IS NULL;

ALTER TABLE siparisler
ALTER COLUMN durum SET DEFAULT 'beklemede';
