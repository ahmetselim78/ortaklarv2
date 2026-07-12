import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.log('NO_SUPABASE')
  process.exit(0)
}

const sb = createClient(url, key)
const { data: siparisler, error: e1 } = await sb
  .from('siparisler')
  .select('id, siparis_no, harici_siparis_no, alt_musteri, cari(ad)')
  .eq('harici_siparis_no', '26/0851')
  .limit(3)

if (e1) console.error(e1)
console.log('siparisler:', JSON.stringify(siparisler, null, 2))

if (!siparisler?.length) process.exit(0)

const siparisId = siparisler[0].id
const { data: detaylar, error: e2 } = await sb
  .from('siparis_detaylari')
  .select(`
    id, cam_kodu, genislik_mm, yukseklik_mm, adet, poz,
    stok!stok_id ( kod, ad, grup, katman_yapisi, kalinlik_mm )
  `)
  .eq('siparis_id', siparisId)
  .order('created_at')

if (e2) console.error(e2)
console.log('detay count:', detaylar?.length)

const mixed = detaylar?.filter((d) => {
  const ad = (d.stok?.ad ?? '').toLowerCase()
  return ad.includes('buzlu') || ad.includes('fume') || ad.includes('reflekte')
})
console.log('mixed stok lines:', JSON.stringify(mixed?.map((d) => ({
  cam_kodu: d.cam_kodu,
  genislik_mm: d.genislik_mm,
  yukseklik_mm: d.yukseklik_mm,
  adet: d.adet,
  stok: d.stok,
})), null, 2))

// batch detaylari if exists
const { data: emirler } = await sb
  .from('uretim_emri_detaylari')
  .select(`
    id, sira_no,
    siparis_detaylari (
      genislik_mm, yukseklik_mm, adet,
      stok!stok_id ( kod, ad, grup, katman_yapisi )
    )
  `)
  .in('siparis_detay_id', (detaylar ?? []).map((d) => d.id))
  .order('sira_no')

console.log('batch emir detay count:', emirler?.length)
const h627 = emirler?.filter((e) => {
  const d = e.siparis_detaylari
  if (!d) return false
  const w = Math.min(d.genislik_mm, d.yukseklik_mm)
  const h = Math.max(d.genislik_mm, d.yukseklik_mm)
  return w === 627 || h === 627
})
console.log('627 family batch lines:', JSON.stringify(h627?.map((e) => ({
  sira_no: e.sira_no,
  ...e.siparis_detaylari,
  stok: e.siparis_detaylari?.stok,
})), null, 2))
