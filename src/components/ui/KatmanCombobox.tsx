import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (v: string) => void
  options: string[]
  /** Görsel hata vurgusu */
  invalid?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
  title?: string
  /** Otomatik aç/kapat tetikleyicileri */
  openOnFocus?: boolean
}

/**
 * Native <datalist> yerine kullanılan kontrol edilmiş combobox.
 * Browser/OS koyu tema etkisinden bağımsız olarak Tailwind ile şekilleniyor.
 *
 * - Yazarken giriş `onChange`'e iletilir (slash/boşluk vs. üst katman temizleyebilir).
 * - Aşağı ok / focus / chevron → dropdown açılır.
 * - ↑/↓ ile dolaşma, Enter ile seç, Esc ile dropdown'u kapat (modal'a yayılmaz).
 */
export default function KatmanCombobox({
  value,
  onChange,
  options,
  invalid,
  placeholder = '4+16+4',
  className,
  inputClassName,
  title,
  openOnFocus = true,
}: Props) {
  const [acik, setAcik] = useState(false)
  const [aktifIdx, setAktifIdx] = useState<number>(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Filtreli liste — kullanıcı yazdığı sürece prefix eşleşmesi
  const filtreli = (() => {
    const q = value.trim()
    if (!q) return options
    return options.filter(o => o.startsWith(q) || o.includes(q))
  })()

  // Dış tıklamada kapan
  useEffect(() => {
    if (!acik) return
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setAcik(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [acik])

  // Aktif satırı görünür tut
  useEffect(() => {
    if (!acik || aktifIdx < 0) return
    const el = listRef.current?.children[aktifIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [aktifIdx, acik])

  const sec = (v: string) => {
    onChange(v)
    setAcik(false)
    setAktifIdx(-1)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!acik) { setAcik(true); setAktifIdx(0); return }
      setAktifIdx(i => Math.min(i + 1, filtreli.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!acik) return
      setAktifIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (acik && aktifIdx >= 0 && filtreli[aktifIdx]) {
        e.preventDefault()
        sec(filtreli[aktifIdx])
      }
    } else if (e.key === 'Escape') {
      if (acik) {
        e.preventDefault()
        e.stopPropagation()  // Modal'ın ESC handler'ı tetiklenmesin
        setAcik(false)
        setAktifIdx(-1)
      }
    } else if (e.key === 'Tab') {
      setAcik(false)
    }
  }

  return (
    <div ref={wrapRef} className={cn('relative inline-block', className)}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); if (!acik) setAcik(true); setAktifIdx(-1) }}
        onFocus={e => { if (openOnFocus) setAcik(true); e.currentTarget.select() }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        title={title}
        className={cn(
          'w-full rounded border px-2 py-1.5 pr-6 text-xs font-mono focus:outline-none focus:ring-1 bg-white text-gray-800',
          invalid
            ? 'border-red-300 focus:ring-red-400 bg-red-50'
            : 'border-gray-200 focus:ring-blue-500',
          inputClassName,
        )}
      />
      <button
        type="button"
        onClick={() => { setAcik(v => !v); inputRef.current?.focus() }}
        tabIndex={-1}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
        aria-label="Önerileri aç"
      >
        <ChevronDown size={12} className={cn('transition-transform', acik && 'rotate-180')} />
      </button>

      {acik && filtreli.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          role="listbox"
        >
          {filtreli.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={i === aktifIdx}
              onMouseDown={e => { e.preventDefault(); sec(opt) }}
              onMouseEnter={() => setAktifIdx(i)}
              className={cn(
                'px-3 py-1.5 text-xs font-mono cursor-pointer select-none',
                i === aktifIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50',
              )}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
