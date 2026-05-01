import { useEffect } from 'react'

/**
 * ESC tuşuna basıldığında verilen kapatma fonksiyonunu çalıştırır.
 * Modal/dialog bileşenlerinde tutarlı klavye desteği sağlamak için kullanılır.
 *
 * @param onClose Kapatma fonksiyonu (genelde `onKapat`)
 * @param enabled Hook'un aktif olup olmadığını belirler (varsayılan: true)
 */
export function useEscape(onClose: () => void, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Açık bir <select> / autocomplete dropdown'ı kapatırken ESC
      // event'ini tüketmesin diye composing kontrolü:
      if ((e as any).isComposing) return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, enabled])
}
