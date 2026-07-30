export interface KdvGrubuOtomatikAlanlari {
  oran: number
  kod: string
  ad: string
}

export function kdvGrubuOtomatikAlanlariniOlustur(
  oranMetni: string,
): KdvGrubuOtomatikAlanlari | null {
  const standartOran = oranMetni.trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,4})?$/.test(standartOran)) return null

  const oran = Number(standartOran)
  if (!Number.isFinite(oran) || oran < 0 || oran > 100) return null

  const sadeOran = oran.toFixed(4).replace(/\.?0+$/, '')
  return {
    oran,
    kod: `KDV${sadeOran.replace('.', '_')}`,
    ad: `KDV %${sadeOran.replace('.', ',')}`,
  }
}
