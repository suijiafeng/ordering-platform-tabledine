import { create } from 'zustand'

/**
 * 商家端提示音。每个事件一种声音，按节奏而不只是音高区分，隔着几米也能听出是哪类事件。
 * 目前全部用 Web Audio 合成占位；以后换成录音（如人声「您有新订单」）时，把文件放到 public/sounds/，
 * 在 SOUND_FILES 里登记即可，调用方不用改。文件加载失败会自动退回合成音。
 */
export type SoundKind =
  /** 新订单待接单（前厅 / 店主） */
  | 'newOrder'
  /** 仍有订单未接单，按设置的间隔重复提醒（前厅 / 店主） */
  | 'remindPending'
  /** 前厅已确认、新到的制作单（后厨） */
  | 'kitchenNewOrder'
  /** 顾客申请取消订单（前厅 / 店主） */
  | 'cancelRequest'
  /** 后厨出餐，等前厅取餐送达（前厅 / 店主） */
  | 'orderReady'
  /** 后厨看板上有订单超时 */
  | 'kitchenOverdue'
  /** 后厨看板「开始制作 / 制作完成」操作成功（戴手套、油手时靠声音确认点到了） */
  | 'actionDone'
  /** 新的退款申请 / 退款失败（店主） */
  | 'refundAttention'
  /** 退款申请超过 2 小时未审核（店主） */
  | 'refundOverdue'
  /** 与服务器断开连接 */
  | 'networkLost'
  /** 连接恢复 */
  | 'networkRestored'

/**
 * label：设置页试听列表里的名称；voice：换成人声时建议的录音文案（给配音用，代码不读）。
 * 人声建议 1–2 秒、语速偏快；同时发生的多个提示会排队依次播放，不会叠在一起。
 */
export const SOUND_META: Record<SoundKind, { label: string; voice: string }> = {
  newOrder: { label: '新订单', voice: '您有新订单，请及时接单' },
  remindPending: { label: '未接单重复提醒', voice: '还有订单未接单' },
  kitchenNewOrder: { label: '后厨新制作单', voice: '新订单，请开始制作' },
  cancelRequest: { label: '顾客申请取消', voice: '有顾客申请取消订单，请尽快处理' },
  orderReady: { label: '出餐待取餐', voice: '有菜品出餐了，请取餐' },
  kitchenOverdue: { label: '后厨订单超时', voice: '有订单超时，请优先处理' },
  actionDone: { label: '后厨操作成功', voice: '好的' },
  refundAttention: { label: '退款待处理', voice: '有新的退款需要处理' },
  refundOverdue: { label: '退款超时未审核', voice: '有退款申请超过两小时未审核' },
  networkLost: { label: '网络断开', voice: '网络已断开，新订单提醒暂停' },
  networkRestored: { label: '网络恢复', voice: '网络已恢复' },
}

/**
 * 录音替换表：路径相对站点根目录（public/ 下），如 newOrder: 'sounds/new-order.mp3'。
 * 没登记的事件用下面的合成音；录音文件加载失败也会退回合成音。
 */
const SOUND_FILES: Partial<Record<SoundKind, string>> = {}

interface Note {
  /** 频率（Hz） */
  f: number
  /** 相对开始时间（秒） */
  at: number
  /** 时长（秒） */
  dur: number
  type?: OscillatorType
  /** 峰值音量，默认 0.4 */
  gain?: number
}

/** 合成占位音。每种的节奏不同：双音 / 三连 / 钟声 / 下行 / 交替…… */
const SYNTH: Record<SoundKind, Note[]> = {
  // 叮咚：高 → 低两声
  newOrder: [
    { f: 1318, at: 0, dur: 0.3 },
    { f: 1046, at: 0.22, dur: 0.45 },
  ],
  // 同音高快速三连，比新订单更急
  remindPending: [
    { f: 1318, at: 0, dur: 0.12 },
    { f: 1318, at: 0.18, dur: 0.12 },
    { f: 1318, at: 0.36, dur: 0.18 },
  ],
  // 服务铃：基音 + 不谐和泛音，余音长，连响两下；厨房嘈杂，频率放在 1–3 kHz 段更容易听见
  kitchenNewOrder: [
    { f: 1175, at: 0, dur: 0.9, type: 'triangle', gain: 0.45 },
    { f: 3240, at: 0, dur: 0.5, gain: 0.12 },
    { f: 1175, at: 0.35, dur: 0.9, type: 'triangle', gain: 0.45 },
    { f: 3240, at: 0.35, dur: 0.5, gain: 0.12 },
  ],
  // 下行两声：警示，和新订单的「叮咚」明显不同
  cancelRequest: [
    { f: 988, at: 0, dur: 0.22, type: 'triangle' },
    { f: 659, at: 0.25, dur: 0.4, type: 'triangle' },
  ],
  // 上行三音「叮叮叮」：好消息，和取消申请的下行区分开
  orderReady: [
    { f: 784, at: 0, dur: 0.15 },
    { f: 988, at: 0.13, dur: 0.15 },
    { f: 1318, at: 0.26, dur: 0.35 },
  ],
  // 高低交替两轮，类似警报
  kitchenOverdue: [
    { f: 1175, at: 0, dur: 0.12, type: 'square', gain: 0.18 },
    { f: 880, at: 0.14, dur: 0.12, type: 'square', gain: 0.18 },
    { f: 1175, at: 0.28, dur: 0.12, type: 'square', gain: 0.18 },
    { f: 880, at: 0.42, dur: 0.16, type: 'square', gain: 0.18 },
  ],
  // 极短的确认音，不打断厨房节奏
  actionDone: [
    { f: 1568, at: 0, dur: 0.08, gain: 0.25 },
  ],
  // 单声，轻柔
  refundAttention: [
    { f: 784, at: 0, dur: 0.35 },
  ],
  refundOverdue: [
    { f: 784, at: 0, dur: 0.18, type: 'triangle' },
    { f: 784, at: 0.24, dur: 0.3, type: 'triangle' },
  ],
  // 低沉下行
  networkLost: [
    { f: 330, at: 0, dur: 0.25, type: 'sawtooth', gain: 0.15 },
    { f: 220, at: 0.28, dur: 0.45, type: 'sawtooth', gain: 0.15 },
  ],
  // 短促上行
  networkRestored: [
    { f: 523, at: 0, dur: 0.12 },
    { f: 784, at: 0.12, dur: 0.25 },
  ],
}

const ENABLED_KEY = 'merchant_sound_enabled'

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

interface SoundState {
  /** 提示音总开关（仅当前浏览器） */
  enabled: boolean
  /** 被浏览器自动播放策略拦截（需要用户点一下页面） */
  blocked: boolean
  setEnabled: (v: boolean) => void
}

export const useSoundStore = create<SoundState>((set) => ({
  enabled: loadEnabled(),
  blocked: false,
  setEnabled: (v) => {
    try {
      localStorage.setItem(ENABLED_KEY, v ? '1' : '0')
    } catch {
      // 忽略
    }
    set({ enabled: v })
  },
}))

let audioCtx: AudioContext | null = null

/** 复用同一个 AudioContext；浏览器自动播放策略下它可能处于 suspended，需要用户点一下页面才能恢复 */
function audioContext(): AudioContext {
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new Ctx()
  }
  return audioCtx
}

/** 用户任意一次点击 / 按键后尝试恢复音频（浏览器只允许在用户手势里恢复） */
export function unlockSound() {
  try {
    const ctx = audioContext()
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => useSoundStore.setState({ blocked: false })).catch(() => {})
    } else {
      useSoundStore.setState({ blocked: false })
    }
  } catch {
    // 浏览器不支持 Web Audio
  }
}

/** 已解码的录音；null 表示加载失败，以后都用合成音 */
const buffers = new Map<SoundKind, AudioBuffer | null>()
const loading = new Map<SoundKind, Promise<AudioBuffer | null>>()

function loadBuffer(ctx: AudioContext, kind: SoundKind): Promise<AudioBuffer | null> {
  const cached = buffers.get(kind)
  if (cached !== undefined) return Promise.resolve(cached)
  let p = loading.get(kind)
  if (!p) {
    p = fetch(import.meta.env.BASE_URL + SOUND_FILES[kind])
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null)
      .then((buf) => {
        buffers.set(kind, buf)
        loading.delete(kind)
        return buf
      })
    loading.set(kind, p)
  }
  return p
}

/**
 * 排队播放：几个事件同时发生时依次播放，不叠在一起（换成人声后叠放会听不清）。
 * busyUntil 是上一个声音结束的时间（AudioContext 时钟）；同一种声音已在排队就不再追加。
 */
let busyUntil = 0
const queued = new Set<SoundKind>()
const GAP = 0.15
/** 排队太长（例如断网恢复后一下子来了很多事件）就丢弃，避免几十秒后还在响 */
const MAX_DELAY = 6

function schedule(ctx: AudioContext, kind: SoundKind, duration: number, start: (at: number) => void) {
  const now = ctx.currentTime
  const at = Math.max(now, busyUntil > now ? busyUntil + GAP : now)
  if (at - now > MAX_DELAY) return
  busyUntil = at + duration
  if (at > now) {
    queued.add(kind)
    window.setTimeout(() => queued.delete(kind), (at - now) * 1000)
  }
  start(at)
}

function playSynth(ctx: AudioContext, kind: SoundKind) {
  const notes = SYNTH[kind]
  const duration = Math.max(...notes.map((n) => n.at + n.dur))
  schedule(ctx, kind, duration, (t0) => {
    for (const n of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = n.type ?? 'sine'
      osc.frequency.value = n.f
      const start = t0 + n.at
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(n.gain ?? 0.4, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + n.dur + 0.05)
    }
  })
}

function playBuffer(ctx: AudioContext, kind: SoundKind, buf: AudioBuffer) {
  schedule(ctx, kind, buf.duration, (at) => {
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(at)
  })
}

/**
 * 播放某个事件的提示音。总开关关闭时不响；force 用于「试听」，无视开关。
 * 被浏览器自动播放策略拦截时标记 blocked，页面提示用户点一下启用。
 */
export function playSound(kind: SoundKind, opts: { force?: boolean } = {}) {
  if (!opts.force && !useSoundStore.getState().enabled) return
  if (queued.has(kind)) return
  try {
    const ctx = audioContext()
    if (ctx.state === 'suspended') {
      useSoundStore.setState({ blocked: true })
      void ctx.resume().catch(() => {})
    }
    if (!SOUND_FILES[kind]) {
      playSynth(ctx, kind)
      return
    }
    const cached = buffers.get(kind)
    if (cached) {
      playBuffer(ctx, kind, cached)
    } else if (cached === null) {
      playSynth(ctx, kind)
    } else {
      // 第一次用到录音：加载完再播；加载失败退回合成音
      void loadBuffer(ctx, kind).then((buf) => (buf ? playBuffer(ctx, kind, buf) : playSynth(ctx, kind)))
    }
  } catch {
    // 浏览器不支持 Web Audio
  }
}
