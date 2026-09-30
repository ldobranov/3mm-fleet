import { onUnmounted, ref } from 'vue'
import en from './locales/en.json'
import bg from './locales/bg.json'

export class FleetHttpError extends Error {
  constructor(public status: number) { super(`HTTP ${status}`) }
}

export function useFleetText() {
  const readLanguage = () => localStorage.getItem('preferredLanguage') || 'en'
  const language = ref(readLanguage())
  const update = () => { language.value = readLanguage() }
  window.addEventListener('language-changed', update)
  window.addEventListener('storage', update)
  onUnmounted(() => {
    window.removeEventListener('language-changed', update)
    window.removeEventListener('storage', update)
  })
  const t = (key: keyof typeof en, params: Record<string, string | number> = {}) => {
    const dictionary = language.value.split('-')[0] === 'bg' ? bg : en
    let text: string = dictionary[key] || en[key]
    for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value))
    return text
  }
  const formatDate = (value: string | null) => {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language.value)
  }
  const formatLastSeen = (value: string | null) => {
    if (!value) return t('never')
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
    if (!Number.isFinite(seconds)) return value
    if (seconds < 10) return t('now')
    if (seconds < 60) return t('secondsAgo', { n: seconds })
    if (seconds < 3600) return t('minutesAgo', { n: Math.floor(seconds / 60) })
    if (seconds < 86400) return t('hoursAgo', { n: Math.floor(seconds / 3600) })
    return formatDate(value)
  }
  const deviceStatus = (device: { revoked_at: string | null; online: boolean }) =>
    device.revoked_at ? 'revoked' : device.online ? 'online' : 'offline'
  return { t, language, formatDate, formatLastSeen, deviceStatus }
}

export function useFleetApi() {
  const lifetime = new AbortController()
  onUnmounted(() => lifetime.abort())
  let backend: Promise<string> | undefined
  async function timedFetch(url: string, options: RequestInit = {}) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (lifetime.signal.aborted) abort()
    lifetime.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, 10000)
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      // Keep the timeout active while reading the body, not just the headers.
      const text = await response.text()
      if (!response.ok) throw new FleetHttpError(response.status)
      return text ? JSON.parse(text) : undefined
    } finally {
      clearTimeout(timer)
      lifetime.signal.removeEventListener('abort', abort)
    }
  }
  async function resolveBackend() {
    if (!backend) backend = (async () => {
      try {
        const override = localStorage.getItem('mm_backend_url_override')
        if (override !== null) return override.trim().replace(/\/+$/, '')
        const config = await timedFetch('/runtime-config.json', { cache: 'no-store' })
        if (typeof config?.backend_url === 'string' && config.backend_url.trim())
          return config.backend_url.trim().replace(/\/+$/, '')
        if (Number.isInteger(config?.backend_port) && config.backend_port > 0 && config.backend_port <= 65535) {
          const url = new URL(window.location.origin)
          url.port = String(config.backend_port)
          return url.origin
        }
      } catch {
        if (lifetime.signal.aborted) throw new Error('Disposed')
      }
      const url = new URL(window.location.origin)
      url.port = '8887'
      return url.origin
    })()
    return backend
  }
  async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
    const base = await resolveBackend()
    if (lifetime.signal.aborted) throw new Error('Disposed')
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${localStorage.getItem('authToken') || ''}`)
    return timedFetch(`${base}${path}`, { ...options, headers })
  }
  return { requestJson }
}
