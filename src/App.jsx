
import React, { useEffect, useMemo, useRef, useState } from 'react'

const COLORS = ['#facc15', '#fb923c', '#60a5fa', '#f472b6', '#a3a3a3', '#34d399', '#c084fc', '#f87171']
const DEFAULT_PATTERNS = [2, 3, 4, 6]
const SYNTH_TYPES = ['kick', 'conga', 'stick', 'bongo', 'beep', 'snare', 'hihat', 'tom', 'clap', 'cowbell', 'rim']

function getRadius(x) {
  if (x <= 1) return 10
  if (x <= 2) return 14
  if (x <= 3) return 16
  return 18
}

function shuffle(array, rand = Math.random) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function sample(array, n, rand = Math.random) {
  return shuffle(array, rand).slice(0, n)
}

function parsePatterns(text) {
  const vals = text
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n >= 2 && n <= 16)
  return vals.length ? vals : DEFAULT_PATTERNS
}

function regularPolygonPoints(n, radius, cx, cy, rotation = 0) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = rotation + (Math.PI * 2 * i) / n - Math.PI / 2
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)])
  }
  return pts
}

function pointOnPolygon(vertices, t) {
  const N = vertices.length
  const pos = ((t % 1) + 1) % 1 * N
  const i = Math.floor(pos)
  const frac = pos - i
  const a = vertices[i]
  const b = vertices[(i + 1) % N]
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]
}

function buildRandomPlans(patterns, loopCounts, rand) {
  const plans = []
  for (let i = 0; i < loopCounts; i++) {
    const subCount = Math.floor(rand() * patterns.length) + 1
    plans.push(sample(patterns, subCount, rand).sort((a, b) => a - b))
  }
  return plans
}

function parseCustomPlans(text, patterns) {
  const lines = text.split('\n').map(x => x.trim()).filter(Boolean)
  if (!lines.length) return null

  const allowed = new Set(patterns)
  const plans = []

  for (const line of lines) {
    const nums = line
      .split(',')
      .map(x => Number(x.trim()))
      .filter(n => Number.isFinite(n))
      .filter(n => allowed.has(n))
    const uniqueSorted = [...new Set(nums)].sort((a, b) => a - b)
    if (uniqueSorted.length) plans.push(uniqueSorted)
  }

  return plans.length ? plans : null
}

function parseDurations(text, planCount, fallback = 2) {
  const vals = text
    .split(/[\n,]+/)
    .map(x => Number(String(x).trim()))
    .filter(n => Number.isFinite(n) && n > 0)

  if (!vals.length) return Array.from({ length: planCount }, () => fallback)

  const arr = []
  for (let i = 0; i < planCount; i++) {
    arr.push(vals[i] ?? vals[vals.length - 1] ?? fallback)
  }
  return arr
}

function buildSchedule(plans, patterns, oneRoundTimes) {
  const tracks = patterns.map(() => [])
  let soundPositions = patterns.map(() => 0)

  for (let index = 0; index < plans.length; index++) {
    const maxPos = Math.max(...soundPositions)
    soundPositions = soundPositions.map(() => maxPos)

    for (const t of plans[index]) {
      const positionIndex = patterns.indexOf(t)
      for (let step = 0; step < t; step++) {
        tracks[positionIndex].push({
          time: soundPositions[positionIndex],
          duration: oneRoundTimes[index],
          polygonSides: t,
          planIndex: index,
          stepIndex: step
        })
        soundPositions[positionIndex] += oneRoundTimes[index] / t
      }
    }
  }

  return {
    tracks,
    totalDuration: Math.max(0, ...tracks.flat().map(x => x.time)) + (oneRoundTimes.at(-1) || 2)
  }
}

function synthFactory(ctx, destination = ctx.destination) {
  const master = ctx.createGain()
  master.gain.value = 1
  master.connect(destination)

  function env(gainNode, start, attack, decay, sustain, release, peak = 1) {
    gainNode.gain.cancelScheduledValues(start)
    gainNode.gain.setValueAtTime(0.0001, start)
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + attack)
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), start + attack + decay)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay + release)
  }

  function noiseBuffer(seconds = 0.12) {
    const size = Math.max(1, Math.floor(ctx.sampleRate * seconds))
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  function percussion(kind, when, volume, pitch = 1) {
    const out = ctx.createGain()
    out.gain.value = volume
    out.connect(master)

    if (kind === 'kick') {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(160 * pitch, when)
      osc.frequency.exponentialRampToValueAtTime(Math.max(32, 42 * pitch), when + 0.18)
      env(g, when, 0.002, 0.03, 0.4, 0.22, 1.0)
      osc.connect(g); g.connect(out)
      osc.start(when); osc.stop(when + 0.32)
      return
    }

    if (kind === 'conga') {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(320 * pitch, when)
      osc.frequency.exponentialRampToValueAtTime(190 * pitch, when + 0.08)
      env(g, when, 0.001, 0.02, 0.25, 0.18, 0.8)
      osc.connect(g); g.connect(out)
      osc.start(when); osc.stop(when + 0.22)
      return
    }

    if (kind === 'stick') {
      const src = ctx.createBufferSource()
      src.buffer = noiseBuffer(0.08)
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 2500 * pitch
      const g = ctx.createGain()
      env(g, when, 0.001, 0.005, 0.12, 0.04, 0.6)
      src.connect(filter); filter.connect(g); g.connect(out)
      src.start(when); src.stop(when + 0.08)
      return
    }

    if (kind === 'beep') {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(540 * pitch, when)
      env(g, when, 0.001, 0.03, 0.2, 0.10, 0.55)
      osc.connect(g); g.connect(out)
      osc.start(when); osc.stop(when + 0.16)
      return
    }

    if (kind === 'snare') {
      const src = ctx.createBufferSource()
      src.buffer = noiseBuffer(0.16)
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1800 * pitch
      const g = ctx.createGain()
      env(g, when, 0.001, 0.02, 0.18, 0.14, 0.9)
      src.connect(filter); filter.connect(g); g.connect(out)

      const osc = ctx.createOscillator()
      const og = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(220 * pitch, when)
      osc.frequency.exponentialRampToValueAtTime(120 * pitch, when + 0.08)
      env(og, when, 0.001, 0.01, 0.08, 0.1, 0.25)
      osc.connect(og); og.connect(out)

      src.start(when); src.stop(when + 0.18)
      osc.start(when); osc.stop(when + 0.18)
      return
    }

    if (kind === 'hihat') {
      const src = ctx.createBufferSource()
      src.buffer = noiseBuffer(0.06)
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 5000 * pitch
      const g = ctx.createGain()
      env(g, when, 0.001, 0.003, 0.08, 0.03, 0.6)
      src.connect(filter); filter.connect(g); g.connect(out)
      src.start(when); src.stop(when + 0.06)
      return
    }

    if (kind === 'tom') {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(180 * pitch, when)
      osc.frequency.exponentialRampToValueAtTime(90 * pitch, when + 0.16)
      env(g, when, 0.001, 0.02, 0.18, 0.22, 0.85)
      osc.connect(g); g.connect(out)
      osc.start(when); osc.stop(when + 0.28)
      return
    }

    if (kind === 'clap') {
      for (let i = 0; i < 3; i++) {
        const offset = when + i * 0.012
        const src = ctx.createBufferSource()
        src.buffer = noiseBuffer(0.07)
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 1400 * pitch
        const g = ctx.createGain()
        env(g, offset, 0.001, 0.004, 0.1, 0.05, 0.5)
        src.connect(filter); filter.connect(g); g.connect(out)
        src.start(offset); src.stop(offset + 0.07)
      }
      return
    }

    if (kind === 'cowbell') {
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const g = ctx.createGain()
      osc1.type = 'square'
      osc2.type = 'square'
      osc1.frequency.setValueAtTime(560 * pitch, when)
      osc2.frequency.setValueAtTime(845 * pitch, when)
      env(g, when, 0.001, 0.01, 0.15, 0.12, 0.45)
      osc1.connect(g); osc2.connect(g); g.connect(out)
      osc1.start(when); osc2.start(when)
      osc1.stop(when + 0.18); osc2.stop(when + 0.18)
      return
    }

    if (kind === 'rim') {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(920 * pitch, when)
      env(g, when, 0.001, 0.004, 0.1, 0.03, 0.4)
      osc.connect(g); g.connect(out)
      osc.start(when); osc.stop(when + 0.05)
      return
    }

    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(240 * pitch, when)
    osc.frequency.exponentialRampToValueAtTime(140 * pitch, when + 0.11)
    env(g, when, 0.001, 0.02, 0.3, 0.16, 0.85)
    osc.connect(g); g.connect(out)
    osc.start(when); osc.stop(when + 0.22)
  }

  return { master, percussion }
}

async function decodeAudioFile(file, audioCtx) {
  const arr = await file.arrayBuffer()
  return await audioCtx.decodeAudioData(arr.slice(0))
}

function audioBufferToWav(buffer) {
  const numberOfChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const bytesPerSample = 2
  const blockAlign = numberOfChannels * bytesPerSample
  const dataLength = buffer.length * blockAlign
  const arrayBuffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(arrayBuffer)

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)

  const channels = []
  for (let i = 0; i < numberOfChannels; i++) channels.push(buffer.getChannelData(i))

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      let sample = channels[channel][i]
      sample = Math.max(-1, Math.min(1, sample))
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, intSample, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const defaultSoundSettings = (patterns) =>
  Object.fromEntries(
    patterns.map((p, i) => [p, {
      mode: 'synth',
      synthType: SYNTH_TYPES[i % SYNTH_TYPES.length],
      volume: 0.8,
      pitch: 1,
      playbackRate: 1,
      buffer: null,
      fileName: ''
    }])
  )

export default function App() {
  const [patternText, setPatternText] = useState('2,3,4,6')
  const [loopCounts, setLoopCounts] = useState(12)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(0.55)
  const [titleMode, setTitleMode] = useState('current')
  const [seed, setSeed] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [currentPlanIndex, setCurrentPlanIndex] = useState(0)
  const [planMode, setPlanMode] = useState('random')
  const [customPlansText, setCustomPlansText] = useState('2,3\n2,3,4\n3,4,6\n2,4,6')
  const [durationsText, setDurationsText] = useState('2,2,2,2')
  const [defaultDuration, setDefaultDuration] = useState(2)
  const [soundSettings, setSoundSettings] = useState(defaultSoundSettings(DEFAULT_PATTERNS))
  const [isExportingAudio, setIsExportingAudio] = useState(false)

  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const audioCtxRef = useRef(null)
  const previewSynthRef = useRef(null)
  const startEpochRef = useRef(0)
  const playSessionRef = useRef(0)
  const timeoutIdsRef = useRef([])
  const hitEffectsRef = useRef([])
  const activeGainRef = useRef(null)
  const activeNodesRef = useRef([])
  const activeSynthRef = useRef(null)
  const isPlayingRef = useRef(false)

  const patterns = useMemo(() => parsePatterns(patternText), [patternText])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    setSoundSettings(prev => {
      const next = { ...prev }
      for (const p of patterns) {
        if (!next[p]) {
          next[p] = {
            mode: 'synth',
            synthType: SYNTH_TYPES[patterns.indexOf(p) % SYNTH_TYPES.length],
            volume: 0.8,
            pitch: 1,
            playbackRate: 1,
            buffer: null,
            fileName: ''
          }
        }
      }
      Object.keys(next).forEach(key => {
        if (!patterns.includes(Number(key))) delete next[key]
      })
      return next
    })
  }, [patterns])

  const customPlans = useMemo(() => parseCustomPlans(customPlansText, patterns), [customPlansText, patterns])

  const plans = useMemo(() => {
    if (planMode === 'custom' && customPlans?.length) return customPlans
    let s = seed || 1
    const rand = function () {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }
    return buildRandomPlans(patterns, loopCounts, rand)
  }, [patterns, loopCounts, seed, planMode, customPlans])

  const oneRoundTimes = useMemo(
    () => parseDurations(durationsText, plans.length, defaultDuration),
    [durationsText, plans.length, defaultDuration]
  )

  const schedule = useMemo(() => buildSchedule(plans, patterns, oneRoundTimes), [plans, patterns, oneRoundTimes])
  const displayedPlan = plans[currentPlanIndex] || []

  useEffect(() => {
    drawFrame()
  }, [currentTime, currentPlanIndex, patterns, plans, titleMode, oneRoundTimes])

  function getCtx() {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new Ctx()
      previewSynthRef.current = synthFactory(audioCtxRef.current)
    }
    return audioCtxRef.current
  }

  function clearScheduledPlayback() {
    for (const id of timeoutIdsRef.current) clearTimeout(id)
    timeoutIdsRef.current = []
  }

  function clearHitEffects() {
    hitEffectsRef.current = []
  }

  function addHitEffect(patternValue, pointIndex, duration) {
    hitEffectsRef.current.push({
      patternValue,
      pointIndex,
      duration,
      createdAt: performance.now()
    })
    if (hitEffectsRef.current.length > 150) hitEffectsRef.current.shift()
  }

  function releaseActiveAudio() {
    const ctx = audioCtxRef.current
    if (!ctx) return

    if (activeGainRef.current) {
      const now = ctx.currentTime
      try {
        activeGainRef.current.gain.cancelScheduledValues(now)
        activeGainRef.current.gain.setValueAtTime(activeGainRef.current.gain.value || 1, now)
        activeGainRef.current.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
      } catch {}
      const gainToDisconnect = activeGainRef.current
      setTimeout(() => {
        try { gainToDisconnect.disconnect() } catch {}
      }, 80)
      activeGainRef.current = null
    }

    for (const node of activeNodesRef.current) {
      try { node.stop() } catch {}
      try { node.disconnect() } catch {}
    }
    activeNodesRef.current = []
    activeSynthRef.current = null
  }

  async function playPatternSoundToDestination(patternValue, when, globalVolume, destination, collectNode = true) {
    const ctx = getCtx()
    const config = soundSettings[patternValue]
    if (!config) return

    if (config.mode === 'sample' && config.buffer) {
      const src = ctx.createBufferSource()
      const gain = ctx.createGain()
      src.buffer = config.buffer
      src.playbackRate.value = config.playbackRate || 1
      gain.gain.value = globalVolume * (config.volume || 0.8)
      src.connect(gain)
      gain.connect(destination)
      src.start(when)
      if (collectNode) activeNodesRef.current.push(src, gain)
      return
    }

    if (!activeSynthRef.current || activeSynthRef.current.master.context !== ctx) {
      activeSynthRef.current = synthFactory(ctx, destination)
      if (collectNode) activeNodesRef.current.push(activeSynthRef.current.master)
    }
    activeSynthRef.current.percussion(
      config.synthType || 'bongo',
      when,
      globalVolume * (config.volume || 0.8),
      config.pitch || 1
    )
  }

  async function previewSound(patternValue) {
    const ctx = getCtx()
    await ctx.resume()
    const previewGain = ctx.createGain()
    previewGain.gain.value = 1
    previewGain.connect(ctx.destination)
    const previewSynth = synthFactory(ctx, previewGain)
    const config = soundSettings[patternValue]
    if (config?.mode === 'sample' && config.buffer) {
      const src = ctx.createBufferSource()
      const gain = ctx.createGain()
      src.buffer = config.buffer
      src.playbackRate.value = config.playbackRate || 1
      gain.gain.value = 0.6 * (config.volume || 0.8)
      src.connect(gain)
      gain.connect(previewGain)
      src.start(ctx.currentTime + 0.02)
      src.stop(ctx.currentTime + 1.2)
      setTimeout(() => { try { previewGain.disconnect() } catch {} }, 1400)
      return
    }
    previewSynth.percussion(config?.synthType || 'bongo', ctx.currentTime + 0.02, 0.6 * (config?.volume || 0.8), config?.pitch || 1)
    setTimeout(() => { try { previewGain.disconnect() } catch {} }, 1400)
  }

  async function exportAudioWav() {
    try {
      setIsExportingAudio(true)
      const sampleRate = 44100
      const exportDuration = Math.max(0.5, schedule.totalDuration / playbackRate + 0.5)
      const frameCount = Math.ceil(sampleRate * exportDuration)
      const offlineCtx = new OfflineAudioContext(2, frameCount, sampleRate)
      const offlineSynth = synthFactory(offlineCtx, offlineCtx.destination)

      for (let idx = 0; idx < patterns.length; idx++) {
        const pattern = patterns[idx]
        const config = soundSettings[pattern]
        for (const note of schedule.tracks[idx]) {
          const when = note.time / playbackRate
          const baseVolume = volume / Math.max(1, patterns.length / 2)

          if (config?.mode === 'sample' && config.buffer) {
            const src = offlineCtx.createBufferSource()
            const gain = offlineCtx.createGain()
            src.buffer = config.buffer
            src.playbackRate.value = config.playbackRate || 1
            gain.gain.value = baseVolume * (config.volume || 0.8)
            src.connect(gain)
            gain.connect(offlineCtx.destination)
            src.start(when)
          } else {
            offlineSynth.percussion(config?.synthType || 'bongo', when, baseVolume * (config?.volume || 0.8), config?.pitch || 1)
          }
        }
      }

      const renderedBuffer = await offlineCtx.startRendering()
      const wavBlob = audioBufferToWav(renderedBuffer)
      downloadBlob(wavBlob, `polyrhythm_${patterns.join('-')}.wav`)
    } catch (error) {
      console.error(error)
      alert('Audio export failed. Please try again.')
    } finally {
      setIsExportingAudio(false)
    }
  }

  async function startPlayback() {
    const ctx = getCtx()
    await ctx.resume()
    stopPlayback(false)

    const sessionId = playSessionRef.current + 1
    playSessionRef.current = sessionId

    const sessionGain = ctx.createGain()
    sessionGain.gain.value = 1
    sessionGain.connect(ctx.destination)
    activeGainRef.current = sessionGain
    activeNodesRef.current = [sessionGain]
    activeSynthRef.current = synthFactory(ctx, sessionGain)

    startEpochRef.current = performance.now()
    setIsPlaying(true)
    setCurrentTime(0)
    setCurrentPlanIndex(0)
    clearHitEffects()

    const startAt = ctx.currentTime + 0.05
    const perfOrigin = performance.now() + 50

    for (let idx = 0; idx < patterns.length; idx++) {
      const pattern = patterns[idx]
      for (const note of schedule.tracks[idx]) {
        playPatternSoundToDestination(
          pattern,
          startAt + note.time / playbackRate,
          volume / Math.max(1, patterns.length / 2),
          sessionGain
        )

        const delayMs = Math.max(0, (note.time / playbackRate) * 1000 + perfOrigin - performance.now())
        const timeoutId = setTimeout(() => {
          if (playSessionRef.current !== sessionId || !isPlayingRef.current) return
          addHitEffect(pattern, note.stepIndex, note.duration)
        }, delayMs)
        timeoutIdsRef.current.push(timeoutId)
      }
    }

    function step() {
      if (playSessionRef.current !== sessionId || !isPlayingRef.current) return

      const elapsed = ((performance.now() - startEpochRef.current) / 1000) * playbackRate
      setCurrentTime(elapsed)

      let planIdx = 0
      let accum = 0
      for (let i = 0; i < oneRoundTimes.length; i++) {
        accum += oneRoundTimes[i]
        if (elapsed <= accum) {
          planIdx = i
          break
        }
      }
      setCurrentPlanIndex(Math.min(planIdx, plans.length - 1))

      if (elapsed >= schedule.totalDuration) {
        stopPlayback()
        return
      }
      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
  }

  function stopPlayback(reset = true) {
    playSessionRef.current += 1
    clearScheduledPlayback()
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    releaseActiveAudio()
    setIsPlaying(false)
    if (reset) {
      setCurrentTime(0)
      setCurrentPlanIndex(0)
      clearHitEffects()
    }
  }

  function regenerate() {
    stopPlayback()
    setSeed(x => x + 1)
  }

  function exportConfig() {
    const exportedSoundSettings = Object.fromEntries(
      Object.entries(soundSettings).map(([key, value]) => [
        key,
        {
          mode: value.mode,
          synthType: value.synthType,
          volume: value.volume,
          pitch: value.pitch,
          playbackRate: value.playbackRate,
          fileName: value.fileName
        }
      ])
    )

    const payload = {
      patterns,
      loopCounts,
      playbackRate,
      volume,
      seed,
      planMode,
      customPlansText,
      durationsText,
      defaultDuration,
      plans,
      oneRoundTimes,
      soundSettings: exportedSoundSettings
    }
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'polyrhythm-config.json')
  }

  async function handleSampleUpload(patternValue, file) {
    if (!file) return
    const ctx = getCtx()
    await ctx.resume()
    const buffer = await decodeAudioFile(file, ctx)
    setSoundSettings(prev => ({
      ...prev,
      [patternValue]: {
        ...prev[patternValue],
        mode: 'sample',
        buffer,
        fileName: file.name
      }
    }))
  }

  function updateSound(patternValue, patch) {
    setSoundSettings(prev => ({
      ...prev,
      [patternValue]: {
        ...prev[patternValue],
        ...patch
      }
    }))
  }

  function drawHitFlash(ctx, x, y, color, ageMs) {
    const progress = Math.min(1, ageMs / 280)
    const alpha = Math.max(0, 1 - progress)
    const outer = 10 + progress * 32
    const inner = 4 + progress * 12

    ctx.save()
    ctx.globalAlpha = alpha * 0.45
    ctx.beginPath()
    ctx.arc(x, y, outer, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.arc(x, y, inner, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.restore()
  }

  function drawFrame() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth || 460
    const cssH = canvas.clientHeight || 820
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, cssW, cssH)

    const cx = cssW / 2
    const cy = cssH / 2 + 20
    const base = Math.min(cssW, cssH) * 0.095
    const factors = [1, 1.5, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45]
    const activePlan = plans[currentPlanIndex] || []
    const polygonCache = new Map()

    patterns.forEach((n, idx) => {
      if (!activePlan.includes(n)) return
      const radius = base * (factors[idx % factors.length] + 2)
      const rotation = -Math.PI / 2
      const points = regularPolygonPoints(n, radius, cx, cy, rotation)
      polygonCache.set(n, { points, color: COLORS[idx % COLORS.length] })

      ctx.beginPath()
      points.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
      ctx.strokeStyle = COLORS[idx % COLORS.length]
      ctx.globalAlpha = 0.6
      ctx.lineWidth = 8
      ctx.stroke()
      ctx.globalAlpha = 1

      const roundDuration = oneRoundTimes[currentPlanIndex] || defaultDuration || 2
      let planStart = 0
      for (let i = 0; i < currentPlanIndex; i++) planStart += oneRoundTimes[i]
      const localT = Math.max(0, Math.min(0.999999, (currentTime - planStart) / roundDuration))
      const [bx, by] = pointOnPolygon(points, localT)

      ctx.beginPath()
      ctx.arc(bx, by, getRadius(roundDuration), 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.lineWidth = 4
      ctx.strokeStyle = COLORS[idx % COLORS.length]
      ctx.stroke()
    })

    const now = performance.now()
    hitEffectsRef.current = hitEffectsRef.current.filter(effect => now - effect.createdAt < 300)
    for (const effect of hitEffectsRef.current) {
      const cache = polygonCache.get(effect.patternValue)
      if (!cache) continue
      const sideCount = effect.patternValue
      const t = ((effect.pointIndex % sideCount) + sideCount) % sideCount / sideCount
      const [hx, hy] = pointOnPolygon(cache.points, t)
      drawHitFlash(ctx, hx, hy, cache.color, now - effect.createdAt)
    }

    ctx.fillStyle = '#fff'
    ctx.font = '700 22px Arial'
    const title = titleMode === 'current' ? JSON.stringify(activePlan) : `Polyrhythms - ${patterns.join(',')}`
    const tw = ctx.measureText(title).width
    ctx.fillText(title, (cssW - tw) / 2, 42)

    ctx.font = '500 18px Arial'
    const aw = ctx.measureText('Wangbw').width
    ctx.fillText('Wangbw', (cssW - aw) / 2, cssH - 24)
  }

  useEffect(() => {
    const onResize = () => drawFrame()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [patterns, plans, currentPlanIndex, currentTime, oneRoundTimes])

  useEffect(() => () => stopPlayback(false), [])

  return (
    <div className="app">
      <aside className="panel sidebar">
        <div className="title">Polyrhythm Lab</div>
        <p className="sub">
          Configure patterns, customize each sound, set sequence durations, play live, or export the full mix as WAV.
        </p>

        <div className="stack">
          <div className="row">
            <label>Patterns</label>
            <input value={patternText} onChange={(e) => setPatternText(e.target.value)} />
          </div>

          <div className="row2">
            <div className="row">
              <label>Loops: {loopCounts}</label>
              <input type="range" min="1" max="30" value={loopCounts} onChange={(e) => setLoopCounts(Number(e.target.value))} />
            </div>
            <div className="row">
              <label>Speed: {playbackRate.toFixed(2)}x</label>
              <input type="range" min="0.5" max="2.5" step="0.05" value={playbackRate} onChange={(e) => setPlaybackRate(Number(e.target.value))} />
            </div>
          </div>

          <div className="row2">
            <div className="row">
              <label>Volume: {volume.toFixed(2)}</label>
              <input type="range" min="0.05" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
            </div>
            <div className="row">
              <label>Title</label>
              <select value={titleMode} onChange={(e) => setTitleMode(e.target.value)}>
                <option value="current">Current plan</option>
                <option value="all">All patterns</option>
              </select>
            </div>
          </div>

          <div className="row2">
            <div className="row">
              <label>Plan mode</label>
              <select value={planMode} onChange={(e) => setPlanMode(e.target.value)}>
                <option value="random">Random</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="row">
              <label>Seed: {seed}</label>
              <input type="range" min="1" max="999" value={seed} onChange={(e) => setSeed(Number(e.target.value))} disabled={planMode === 'custom'} />
            </div>
          </div>

          <div className="row2">
            <div className="row">
              <label>Default duration: {defaultDuration.toFixed(1)}s</label>
              <input type="range" min="0.5" max="8" step="0.1" value={defaultDuration} onChange={(e) => setDefaultDuration(Number(e.target.value))} />
            </div>
            <div className="row">
              <label>Sequence durations</label>
              <input value={durationsText} onChange={(e) => setDurationsText(e.target.value)} placeholder="2,2,3,1.5" />
            </div>
          </div>

          {planMode === 'custom' && (
            <div className="row">
              <label>Custom plan sequence (one line = one plan)</label>
              <textarea value={customPlansText} onChange={(e) => setCustomPlansText(e.target.value)} />
            </div>
          )}

          <div className="btnRow">
            {!isPlaying ? (
              <button onClick={startPlayback}>Play</button>
            ) : (
              <button onClick={() => stopPlayback()}>Stop</button>
            )}
            <button className="secondary" onClick={regenerate} disabled={planMode === 'custom'}>Regenerate</button>
          </div>

          <div className="btnRow">
            <button className="secondary" onClick={exportConfig}>Export config</button>
            <button className="secondary" onClick={exportAudioWav} disabled={isExportingAudio}>
              {isExportingAudio ? 'Rendering WAV...' : 'Export WAV'}
            </button>
          </div>

          <div className="btnRow">
            <button
              className="secondary"
              onClick={() => {
                setPatternText('2,3,4,6')
                setLoopCounts(12)
                setPlaybackRate(1)
                setVolume(0.55)
                setSeed(1)
                setPlanMode('random')
                setCustomPlansText('2,3\n2,3,4\n3,4,6\n2,4,6')
                setDurationsText('2,2,2,2')
                setDefaultDuration(2)
                stopPlayback()
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </aside>

      <main className="mainPanel">
        <section className="panel canvasWrap">
          <div className="canvasTop">
            <div>
              <h2>Animated stage</h2>
              <div className="muted">Current plan: {displayedPlan.length ? `[${displayedPlan.join(', ')}]` : '[]'}</div>
            </div>
            <div className="badge">≈ {schedule.totalDuration.toFixed(1)}s</div>
          </div>

          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              maxWidth: 460,
              aspectRatio: '9 / 16',
              display: 'block',
              margin: '0 auto',
              borderRadius: 18,
              border: '1px solid #222'
            }}
          />
        </section>

        <section className="panel sequencePanel">
          <div className="sectionHeader">
            <h3>Plan sequence</h3>
            <div className="muted small">{planMode === 'custom' ? 'Editable from the left panel' : 'Generated from patterns + seed'}</div>
          </div>
          <div className="planList compactPlanList">
            {plans.map((plan, idx) => (
              <span
                key={idx}
                className="planChip"
                style={{ outline: idx === currentPlanIndex && isPlaying ? '2px solid #ffffff55' : 'none' }}
                title={`Duration: ${(oneRoundTimes[idx] ?? defaultDuration).toFixed(2)}s`}
              >
                {idx + 1}. [{plan.join(', ')}] · {(oneRoundTimes[idx] ?? defaultDuration).toFixed(1)}s
              </span>
            ))}
          </div>
        </section>

        <section className="panel soundPanel">
          <div className="sectionHeader">
            <h3>Per-pattern sound panel</h3>
            <div className="muted small">Preview, upload a sample, or tune each synth.</div>
          </div>

          <div className="soundGrid">
            {patterns.map((pattern, idx) => {
              const cfg = soundSettings[pattern] || {}
              return (
                <div className="soundCard" key={pattern}>
                  <div className="soundCardHeader">
                    <span className="soundDot" style={{ background: COLORS[idx % COLORS.length] }} />
                    <strong>Pattern {pattern}</strong>
                  </div>

                  <div className="row2 compactRow2">
                    <div className="row">
                      <label>Mode</label>
                      <select value={cfg.mode || 'synth'} onChange={(e) => updateSound(pattern, { mode: e.target.value })}>
                        <option value="synth">Synth</option>
                        <option value="sample">Sample</option>
                      </select>
                    </div>
                    <div className="row">
                      <label>Type</label>
                      <select
                        value={cfg.synthType || 'bongo'}
                        onChange={(e) => updateSound(pattern, { synthType: e.target.value })}
                        disabled={cfg.mode !== 'synth'}
                      >
                        {SYNTH_TYPES.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="row2 compactRow2">
                    <div className="row">
                      <label>Level {Number(cfg.volume || 0.8).toFixed(2)}</label>
                      <input type="range" min="0.05" max="1.5" step="0.01" value={cfg.volume || 0.8} onChange={(e) => updateSound(pattern, { volume: Number(e.target.value) })} />
                    </div>
                    <div className="row">
                      <label>{cfg.mode === 'sample' ? `Rate ${Number(cfg.playbackRate || 1).toFixed(2)}` : `Pitch ${Number(cfg.pitch || 1).toFixed(2)}`}</label>
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.01"
                        value={cfg.mode === 'sample' ? (cfg.playbackRate || 1) : (cfg.pitch || 1)}
                        onChange={(e) => updateSound(pattern, cfg.mode === 'sample'
                          ? { playbackRate: Number(e.target.value) }
                          : { pitch: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="sampleRow">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => handleSampleUpload(pattern, e.target.files?.[0])}
                    />
                    <div className="sampleName">{cfg.fileName || 'No sample uploaded'}</div>
                  </div>

                  <div className="btnRow">
                    <button className="secondary" onClick={() => previewSound(pattern)}>Preview</button>
                    <button className="secondary" onClick={() => updateSound(pattern, { buffer: null, fileName: '', mode: 'synth' })}>
                      Clear
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="footerInfo">
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>About me</div>
            <div className="muted" style={{ lineHeight: 1.7 }}>
              Author: <a className="link" href="https://www.youtube.com/@Wangbw" target="_blank" rel="noreferrer">wangbw</a><br />
              Inspired by <a className="link" href="https://www.youtube.com/@PccFreeSpace" target="_blank" rel="noreferrer">PCC</a>.<br />
              This project is a browser-based polyrhythm playground for interactive visual music experiments.
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
