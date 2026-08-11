export interface IstasyonPresenceMeta {
  istasyon?: unknown
}

export type IstasyonPresenceState = Record<string, readonly IstasyonPresenceMeta[]>

/** Realtime presence listesinde belirtilen istasyondan en az bir aktif ekran var mı? */
export function istasyonAktifMi(
  presenceState: IstasyonPresenceState,
  istasyon: string,
): boolean {
  return Object.values(presenceState).some(metalar =>
    metalar.some(meta => meta.istasyon === istasyon),
  )
}
