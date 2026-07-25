import { describe, expect, it } from 'vitest'
import { repairUtf8Mojibake, utf8JsonWithBom } from './textEncoding'

describe('UTF-8 JSON dışa aktarımı', () => {
  it('çift kodlanmış Türkçe metni onarır', () => {
    expect(repairUtf8Mojibake('DÄ±ÅŸa aktarÄ±m ve doÄŸrulanamadÄ±')).toBe('Dışa aktarım ve doğrulanamadı')
  })

  it('doğru metni değiştirmez ve UTF-8 BOM ekler', () => {
    const content = utf8JsonWithBom({ mesaj: 'Çözüm doğrulandı' })
    expect(content.charCodeAt(0)).toBe(0xfeff)
    expect(JSON.parse(content.slice(1))).toEqual({ mesaj: 'Çözüm doğrulandı' })
  })

  it('JSON içindeki eski bozuk kayıtları da onarır', () => {
    const content = utf8JsonWithBom({ mesaj: 'Telegram sÄ±rrÄ± tanÄ±mlÄ± deÄŸil' })
    expect(JSON.parse(content.slice(1))).toEqual({ mesaj: 'Telegram sırrı tanımlı değil' })
  })
})
