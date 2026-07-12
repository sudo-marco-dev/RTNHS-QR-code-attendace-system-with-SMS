// Pure Web Audio API synth engine - no external assets or libraries

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gainVal: number,
  ctx: AudioContext,
  startTime: number
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  gain.gain.setValueAtTime(gainVal, startTime)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

/** Rising dual-note chime — Success scan */
export function playSuccess(): void {
  const ctx = getCtx()
  const now = ctx.currentTime
  playTone(440, 0.12, 'sine', 0.4, ctx, now)
  playTone(660, 0.15, 'sine', 0.4, ctx, now + 0.11)
}

/** Two quick medium-pitch beeps — Duplicate scan */
export function playDuplicate(): void {
  const ctx = getCtx()
  const now = ctx.currentTime
  playTone(520, 0.07, 'square', 0.2, ctx, now)
  playTone(520, 0.07, 'square', 0.2, ctx, now + 0.14)
}

/** Low descending buzz — Error / invalid */
export function playError(): void {
  const ctx = getCtx()
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(220, now)
  osc.frequency.linearRampToValueAtTime(60, now + 0.35)
  gain.gain.setValueAtTime(0.4, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
  osc.start(now)
  osc.stop(now + 0.35)
}

/** Soft bell chime — State change. double=true plays two bells */
export function playStateChange(double = false): void {
  const ctx = getCtx()
  const now = ctx.currentTime
  playTone(880, 0.18, 'sine', 0.22, ctx, now)
  if (double) {
    playTone(880, 0.18, 'sine', 0.22, ctx, now + 0.22)
  }
}
