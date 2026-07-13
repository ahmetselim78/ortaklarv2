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
    const cal = () => {
      const baslangic = ctx.currentTime
      ;[0, 0.34, 0.68].forEach((gecikme, index) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'square'
        osc.frequency.value = index % 2 === 0 ? 620 : 880
        gain.gain.setValueAtTime(0.38, baslangic + gecikme)
        gain.gain.exponentialRampToValueAtTime(0.001, baslangic + gecikme + 0.26)
        osc.start(baslangic + gecikme)
        osc.stop(baslangic + gecikme + 0.28)
      })
    }
    if (ctx.state === 'suspended') void ctx.resume().then(cal).catch(() => {})
    else cal()
  } catch { /* AudioContext may not be available */ }
}
