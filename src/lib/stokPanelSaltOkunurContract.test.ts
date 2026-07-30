import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8')
const app = read('src', 'App.tsx')
const page = read('src', 'pages', 'StokPage.tsx')
const list = read('src', 'components', 'stok', 'StokListesi.tsx')
const detail = read('src', 'components', 'stok', 'StokDetayPaneli.tsx')
const admin = read('src', 'components', 'admin', 'StokCariMaliyetPaneli.tsx')
const hook = read('src', 'hooks', 'useStok.ts')

describe('stok paneli salt okunur sınırı', () => {
  it('normal stok rotasını yönetim modu açılmadan sunar', () => {
    expect(app).toContain('<StokPage />')
    expect(page).toContain('yonetimModu = false')
    expect(page).toContain('useStok({ yonetimVerileriniYukle: yonetimModu })')
    expect(hook).toContain('yonetimVerileriniYukle ? stokHareketleriniGetir')
    expect(hook).toContain('yonetimVerileriniYukle ? stokTedarikcileriniGetir')
  })

  it('stok hareketi, düzenleme, durum ve silme denetimlerini yalnız yönetim modunda gösterir', () => {
    expect(page).toContain('yonetimModu && <div className="mt-5"><StokHareketListesi')
    expect(page).toContain('yonetimModu && hareketStokId !== undefined')
    expect(page).toContain('yonetimModu && silinecek')
    expect(list).toContain('{yonetimModu && <th')
    expect(list).toContain('{yonetimModu && <td')
    expect(detail).toContain('{yonetimModu && stok.aktif && duzenleyebilir')
    expect(detail).toContain('{yonetimModu && <section>')
    expect(detail).toContain("kullanim.alan !== 'stok_hareketi'")
  })

  it('yönetim özelliklerini admin Stok ve Ticari alanındaki Stok Yönetimi sekmesine taşır', () => {
    expect(admin).toContain("id: 'stok-yonetimi'")
    expect(admin).toContain("etiket: 'Stok Yönetimi'")
    expect(admin).toContain('<StokPage yonetimModu />')
    expect(admin).toContain("useState<AltSekme>('stok-yonetimi')")
  })
})
