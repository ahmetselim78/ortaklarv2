import { describe, expect, it } from 'vitest'
import { shouldIgnoreGlobalError } from './errorReporter'

describe('shouldIgnoreGlobalError', () => {
  it('Vite HMR bağlantı gürültüsünü geliştirme ortamında yok sayar', () => {
    const error = new Error('send was called before connect')
    error.stack = 'Error: send was called before connect\n    at Object.send (http://127.0.0.1:5173/@vite/client:384:15)'

    expect(shouldIgnoreGlobalError(error, true)).toBe(true)
  })

  it('aynı mesajı uygulama kodundan gelirse gizlemez', () => {
    const error = new Error('send was called before connect')
    error.stack = 'Error: send was called before connect\n    at send (http://127.0.0.1:5173/src/lib/socket.ts:10:3)'

    expect(shouldIgnoreGlobalError(error, true)).toBe(false)
  })

  it('üretim ortamında Vite yığını olsa bile hatayı gizlemez', () => {
    const error = new Error('send was called before connect')
    error.stack = 'Error: send was called before connect\n    at Object.send (http://127.0.0.1:5173/@vite/client:384:15)'

    expect(shouldIgnoreGlobalError(error, false)).toBe(false)
  })
})
