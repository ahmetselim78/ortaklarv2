import { describe, expect, it } from 'vitest'
import { resolveSupabaseUrl } from './supabaseUrl'

describe('resolveSupabaseUrl', () => {
  it('yerel ağdan açılan geliştirme uygulamasında Supabase hostunu sunucu hostuyla değiştirir', () => {
    expect(resolveSupabaseUrl('http://127.0.0.1:54321', '192.168.1.145', true))
      .toBe('http://192.168.1.145:54321')
  })

  it('localhost üzerinden açıldığında mevcut adresi korur', () => {
    expect(resolveSupabaseUrl('http://127.0.0.1:54321', 'localhost', true))
      .toBe('http://127.0.0.1:54321')
  })

  it('uzaktaki Supabase proje adresini değiştirmez', () => {
    expect(resolveSupabaseUrl('https://project.supabase.co', '192.168.1.145', true))
      .toBe('https://project.supabase.co')
  })

  it('üretim modunda yapılandırılan adresi değiştirmez', () => {
    expect(resolveSupabaseUrl('http://127.0.0.1:54321', '192.168.1.145', false))
      .toBe('http://127.0.0.1:54321')
  })
})
