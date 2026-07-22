type SignInError = {
  code?: string
  message?: string
  status?: number
}

export function getSignInErrorMessage(error: SignInError) {
  const message = error.message ?? ''

  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'E-posta veya parola hatalı.'
  }

  if (/failed to fetch|network request failed|load failed/i.test(message)) {
    return 'Giriş sunucusuna ulaşılamadı. Ağ bağlantısını ve sunucu adresini kontrol edin.'
  }

  if ((error.status ?? 0) >= 500) {
    return 'Giriş hizmeti şu anda yanıt vermiyor. Lütfen kısa süre sonra tekrar deneyin.'
  }

  return 'Giriş işlemi tamamlanamadı. Lütfen tekrar deneyin.'
}
