// UI sound preference + the one sound we make: a tiny tick on navigation.
// Off by default; the preference lives in localStorage.

let ctx: AudioContext | null = null

export function soundEnabled(): boolean {
  try {
    return localStorage.sound === 'on'
  } catch {
    return false
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.sound = on ? 'on' : 'off'
  } catch {
    /* private mode */
  }
}

export function playTick() {
  if (!soundEnabled()) return
  try {
    ctx ??= new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 1180
    gain.gain.setValueAtTime(0.035, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.08)
  } catch {
    /* no audio available */
  }
}
