let _ctx: AudioContext | null = null

function getContext(): AudioContext {
  if (!_ctx) _ctx = new AudioContext()
  return _ctx
}

export function beep(type: 'success' | 'error' | 'complete') {
  try {
    const ctx = getContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'success') {
      osc.type = 'sine'
      osc.frequency.value = 880
    } else if (type === 'complete') {
      osc.type = 'sine'
      osc.frequency.value = 1200
    } else {
      osc.type = 'sawtooth'
      osc.frequency.value = 220
    }

    const dur = type === 'complete' ? 0.4 : type === 'success' ? 0.15 : 0.4
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start()
    osc.stop(ctx.currentTime + dur)
  } catch { /* AudioContext may not be available */ }
}

export function beepAlert() {
  try {
    const ctx = getContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'square'
    osc.frequency.value = 440
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch { /* AudioContext may not be available */ }
}
