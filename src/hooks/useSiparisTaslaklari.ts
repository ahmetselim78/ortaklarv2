import { useCallback, useEffect, useState } from 'react'
import type { SiparisTaslak, SiparisTaslakVerisi } from '@/types/taslak'

const STORAGE_KEY = 'ortaklar.siparis_taslaklari.v1'

function readAll(): SiparisTaslak[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t: any) => t && typeof t.id === 'string' && t.veri)
  } catch {
    return []
  }
}

function writeAll(list: SiparisTaslak[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // QuotaExceededError vb. — sessizce yut
  }
}

function makeId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Manuel "Yeni Sipariş" formundaki yarım kalan girişleri localStorage'da
 * yöneten hook. Çoklu sekme arasında 'storage' event'i ile senkron olur.
 */
export function useSiparisTaslaklari() {
  const [taslaklar, setTaslaklar] = useState<SiparisTaslak[]>(() => readAll())

  // Diğer sekmedeki değişiklikleri dinle
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setTaslaklar(readAll())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  /** Yeni taslak oluşturur veya var olanı (id verilmişse) günceller. */
  const upsert = useCallback((veri: SiparisTaslakVerisi, id?: string): SiparisTaslak => {
    const now = new Date().toISOString()
    const list = readAll()
    let saved: SiparisTaslak
    if (id) {
      const idx = list.findIndex(t => t.id === id)
      if (idx >= 0) {
        saved = { ...list[idx], updated_at: now, veri }
        list[idx] = saved
      } else {
        saved = { id, created_at: now, updated_at: now, veri }
        list.push(saved)
      }
    } else {
      saved = { id: makeId(), created_at: now, updated_at: now, veri }
      list.push(saved)
    }
    writeAll(list)
    setTaslaklar(list)
    return saved
  }, [])

  const sil = useCallback((id: string) => {
    const list = readAll().filter(t => t.id !== id)
    writeAll(list)
    setTaslaklar(list)
  }, [])

  const getir = useCallback((id: string): SiparisTaslak | undefined => {
    return readAll().find(t => t.id === id)
  }, [])

  return { taslaklar, upsert, sil, getir }
}

/**
 * Verinin "boş" sayılıp sayılmadığını döner — boşsa taslak yazılmamalı.
 * Müşteri seçilmemişse VE hiçbir cam parçasında ölçü/stok yoksa boş kabul edilir.
 */
export function taslakBosMu(v: SiparisTaslakVerisi): boolean {
  if (v.cari_id) return false
  if (v.alt_musteri && v.alt_musteri.trim()) return false
  if (v.notlar && v.notlar.trim()) return false
  if (v.teslim_tarihi) return false
  if (v.camlar?.some(c => c.stok_id || c.genislik_mm || c.yukseklik_mm)) return false
  return true
}
