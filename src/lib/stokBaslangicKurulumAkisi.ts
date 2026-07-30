export interface IkiAsamaliKurulumSonucu<TKatalog, TRecete> {
  katalog: TKatalog
  recete: TRecete | null
  receteHatasi: Error | null
}

function hataNesnesi(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Standart maliyet reçeteleri hazırlanamadı.')
}

/**
 * Katalog kurulumu ana işlemdir. Yalnız bu aşama hata verirse promise reddedilir.
 * Reçete kurulumu daha sonra güvenle tekrar edilebildiği için hatası başarılı
 * katalog sonucuyla birlikte döndürülür.
 */
export async function stokKataloguVeReceteleriKur<TKatalog, TRecete>(
  kataloguKur: () => Promise<TKatalog>,
  receteleriKur: () => Promise<TRecete>,
): Promise<IkiAsamaliKurulumSonucu<TKatalog, TRecete>> {
  const katalog = await kataloguKur()

  try {
    const recete = await receteleriKur()
    return { katalog, recete, receteHatasi: null }
  } catch (error) {
    return { katalog, recete: null, receteHatasi: hataNesnesi(error) }
  }
}
