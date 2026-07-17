/**
 * Cron URL/authorization artık tarayıcı veya `ayarlar` tablosuna yazılmaz.
 * Zamanlayıcı, ayrı servis kimliği ve `CRON_SHARED_SECRET` ile altyapıda kurulur.
 */
export async function telegramEdgeConfigSenkronize(): Promise<void> {
  return Promise.resolve()
}

export async function telegramEdgeConfigVarMi(): Promise<boolean> {
  return true
}
