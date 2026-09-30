<template>
  <main class="device-page">
    <header class="page-header">
      <div>
        <a class="back-link" href="/fleet">← Устройства</a>

        <h1>
          {{ device?.display_name || inventoryValue('hostname') || 'Устройство' }}
        </h1>

        <code>{{ deviceId }}</code>
      </div>

      <div class="header-actions">
        <span
          v-if="device"
          class="status"
          :class="device.online ? 'online' : 'offline'"
        >
          {{ device.online ? 'Online' : 'Offline' }}
        </span>

        <button
          type="button"
          :disabled="loading"
          @click="refresh"
        >
          {{ loading ? 'Обновяване…' : 'Обнови' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="error" role="alert">
      {{ error }}
    </p>

    <p v-if="loading && !device" class="loading">
      Зареждане на устройството…
    </p>

    <template v-else-if="device">
      <section class="panel">
        <h2>Обща информация</h2>

        <dl class="info-grid">
          <div>
            <dt>Име</dt>
            <dd>{{ device.display_name || '—' }}</dd>
          </div>

          <div>
            <dt>Device ID</dt>
            <dd><code>{{ device.device_id }}</code></dd>
          </div>

          <div>
            <dt>Роля</dt>
            <dd>{{ roleLabel(device.role) }}</dd>
          </div>

          <div>
            <dt>Protocol</dt>
            <dd>{{ device.protocol_version }}</dd>
          </div>

          <div>
            <dt>Статус</dt>
            <dd>{{ device.online ? 'Online' : 'Offline' }}</dd>
          </div>

          <div>
            <dt>Последно видян</dt>
            <dd>{{ formatLastSeen(device.last_seen_at) }}</dd>
          </div>

          <div>
            <dt>Одобрен</dt>
            <dd>{{ formatDate(device.approved_at) }}</dd>
          </div>
        </dl>
      </section>

      <section class="panel">
        <h2>Хардуер и система</h2>

        <p v-if="!device.latest_inventory" class="empty">
          Все още няма inventory от устройството.
        </p>

        <dl v-else class="info-grid">
          <div>
            <dt>Hostname</dt>
            <dd>{{ inventoryValue('hostname') || '—' }}</dd>
          </div>

          <div>
            <dt>Модел</dt>
            <dd>{{ inventoryValue('model') || '—' }}</dd>
          </div>

          <div>
            <dt>Операционна система</dt>
            <dd>
              {{ inventoryValue('operating_system') }}
              {{ inventoryValue('operating_system_version') }}
            </dd>
          </div>

          <div>
            <dt>Kernel</dt>
            <dd>{{ inventoryValue('kernel_version') || '—' }}</dd>
          </div>

          <div>
            <dt>Архитектура</dt>
            <dd>{{ inventoryValue('architecture') || '—' }}</dd>
          </div>

          <div>
            <dt>Python</dt>
            <dd>{{ inventoryValue('python_version') || '—' }}</dd>
          </div>

          <div>
            <dt>CPU</dt>
            <dd>
              {{ inventoryValue('logical_cpu_count') || '—' }}
              <span v-if="inventoryValue('logical_cpu_count')"> cores</span>
            </dd>
          </div>

          <div>
            <dt>RAM</dt>
            <dd>{{ formatBytes(device.latest_inventory.memory_total_bytes) || '—' }}</dd>
          </div>

          <div>
            <dt>Свободно място</dt>
            <dd>{{ formatBytes(device.latest_inventory.root_free_bytes) || '—' }}</dd>
          </div>

          <div>
            <dt>Общо място</dt>
            <dd>{{ formatBytes(device.latest_inventory.root_total_bytes) || '—' }}</dd>
          </div>

          <div>
            <dt>NetworkManager</dt>
            <dd>
              {{
                device.latest_inventory.network_manager_active === true
                  ? 'Active'
                  : device.latest_inventory.network_manager_active === false
                    ? 'Inactive'
                    : '—'
              }}
            </dd>
          </div>

          <div>
            <dt>Hardware driver</dt>
            <dd>{{ inventoryValue('hardware_driver') || '—' }}</dd>
          </div>
        </dl>
      </section>

      <section class="panel">
        <div class="section-header">
          <div>
            <h2>Capabilities</h2>
            <p>Функции, предоставени от активните модули на устройството.</p>
          </div>

          <span class="counter">{{ capabilities.length }}</span>
        </div>

        <p v-if="!capabilities.length" class="empty">
          Няма регистрирани capabilities.
        </p>

        <article
          v-for="capability in capabilities"
          :key="capability.capability_id"
          class="list-item"
        >
          <strong>{{ capability.capability_id }}</strong>

          <div class="muted">
            {{ capability.module_id }} · {{ capability.version }}
          </div>

          <details
            v-if="Object.keys(capability.metadata || {}).length"
            class="metadata"
          >
            <summary>Metadata</summary>
            <pre>{{ JSON.stringify(capability.metadata, null, 2) }}</pre>
          </details>
        </article>
      </section>

      <section class="panel">
        <div class="section-header">
          <div>
            <h2>Последни команди</h2>
            <p>Последните команди, изпратени към това устройство.</p>
          </div>

          <span class="counter">{{ commands.length }}</span>
        </div>

        <p v-if="!commands.length" class="empty">
          Няма изпращани команди.
        </p>

        <article
          v-for="command in commands"
          :key="command.command_id"
          class="list-item"
        >
          <div class="command-header">
            <strong>{{ command.command_type }}</strong>

            <span class="command-status">
              {{ command.status }}
            </span>
          </div>

          <code>{{ command.command_id }}</code>

          <div class="muted">
            {{ formatDate(command.created_at) }}
          </div>

          <div v-if="command.error" class="command-error">
            {{ command.error }}
          </div>

          <details v-if="command.result" class="metadata">
            <summary>Result</summary>
            <pre>{{ JSON.stringify(command.result, null, 2) }}</pre>
          </details>
        </article>
      </section>
    </template>

    <section v-else class="panel">
      Устройството не е намерено.
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

interface DeviceItem {
  device_id: string
  display_name: string | null
  role: string
  protocol_version: string
  approved_at: string
  revoked_at: string | null
  online: boolean
  last_seen_at: string | null
  latest_inventory: Record<string, unknown> | null
}

interface DeviceResponse {
  items: DeviceItem[]
  total: number
}

interface Capability {
  capability_id: string
  module_id: string
  version: string
  metadata: Record<string, unknown>
}

interface Command {
  command_id: string
  status: string
  created_at: string
  expires_at: string
  delivery_attempts: number
  command_type: string
  idempotency_key: string
  delivered_at: string | null
  completed_at: string | null
  result: Record<string, unknown> | null
  error: string | null
}

interface CommandResponse {
  items: Command[]
  total: number
}

const deviceId =
  new URLSearchParams(window.location.search).get('id') || ''

const device = ref<DeviceItem | null>(null)
const capabilities = ref<Capability[]>([])
const commands = ref<Command[]>([])

const loading = ref(false)
const error = ref('')

let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let backendUrlPromise: Promise<string> | undefined

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

async function getBackendUrl(): Promise<string> {
  if (backendUrlPromise) return backendUrlPromise

  backendUrlPromise = (async () => {
    try {
      const response = await fetch('/runtime-config.json', {
        cache: 'no-store',
      })

      if (response.ok) {
        const config = await response.json()

        if (
          typeof config?.backend_url === 'string' &&
          config.backend_url.trim()
        ) {
          return normalizeBaseUrl(config.backend_url)
        }

        if (
          Number.isInteger(config?.backend_port) &&
          config.backend_port > 0 &&
          config.backend_port <= 65535
        ) {
          return `${window.location.protocol}//${window.location.hostname}:${config.backend_port}`
        }
      }
    } catch {
      // Continue.
    }

    try {
      const override = localStorage.getItem(
        'mm_backend_url_override',
      )

      if (override !== null) {
        return normalizeBaseUrl(override)
      }
    } catch {
      // Continue.
    }

    return `${window.location.protocol}//${window.location.hostname}:8887`
  })()

  return backendUrlPromise
}

async function requestJson<T>(path: string): Promise<T> {
  const baseUrl = await getBackendUrl()
  const token = localStorage.getItem('authToken') || ''

  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    let detail = ''

    try {
      const body = await response.json()

      if (typeof body?.detail === 'string') {
        detail = `: ${body.detail}`
      }
    } catch {
      // Ignore non-JSON response.
    }

    throw new Error(`HTTP ${response.status}${detail}`)
  }

  return await response.json() as T
}

async function refresh() {
  if (loading.value || disposed || !deviceId) return

  loading.value = true
  error.value = ''

  try {
    const [registry, capabilityItems, commandHistory] =
      await Promise.all([
        requestJson<DeviceResponse>('/api/v1/devices'),
        requestJson<Capability[]>(
          `/api/v1/devices/${encodeURIComponent(deviceId)}/capabilities`,
        ),
        requestJson<CommandResponse>(
          `/api/v1/devices/${encodeURIComponent(deviceId)}/commands?limit=20`,
        ),
      ])

    device.value =
      registry.items.find(item => item.device_id === deviceId) || null

    capabilities.value = capabilityItems
    commands.value = commandHistory.items
  } catch (reason) {
    error.value = reason instanceof Error
      ? `Неуспешно зареждане: ${reason.message}`
      : 'Неуспешно зареждане.'
  } finally {
    loading.value = false
  }
}

function inventoryValue(key: string): string {
  const value = device.value?.latest_inventory?.[key]

  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return String(value)
  }

  return ''
}

function roleLabel(role: string): string {
  if (role === 'node') return 'Node'
  if (role === 'hub') return 'Hub'
  if (role === 'standalone') return 'Standalone'
  return role
}

function formatDate(value: string | null): string {
  if (!value) return '—'

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('bg-BG')
}

function formatLastSeen(value: string | null): string {
  if (!value) return 'Никога'

  const time = new Date(value).getTime()

  if (Number.isNaN(time)) return value

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - time) / 1000),
  )

  if (seconds < 10) return 'сега'
  if (seconds < 60) return `преди ${seconds} сек.`

  const minutes = Math.floor(seconds / 60)

  if (minutes < 60) return `преди ${minutes} мин.`

  const hours = Math.floor(minutes / 60)

  if (hours < 24) return `преди ${hours} ч.`

  return formatDate(value)
}

function formatBytes(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ''
  }

  return `${(value / (1024 ** 3)).toFixed(1)} GB`
}

async function poll() {
  if (!document.hidden) {
    await refresh()
  }

  if (!disposed) {
    timer = setTimeout(poll, 10000)
  }
}

onMounted(() => {
  if (!deviceId) {
    error.value = 'Липсва Device ID.'
    return
  }

  void poll()
})

onUnmounted(() => {
  disposed = true

  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.device-page {
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1.5rem 0 3rem;
  display: grid;
  gap: 1.25rem;
}

.page-header,
.header-actions,
.section-header,
.command-header {
  display: flex;
  align-items: center;
}

.page-header,
.section-header,
.command-header {
  justify-content: space-between;
  gap: 1rem;
}

.page-header h1 {
  margin: .55rem 0 .25rem;
}

.header-actions {
  gap: .75rem;
}

.back-link {
  color: var(--primary-color, #3b82f6);
  text-decoration: none;
}

.panel {
  border: 1px solid var(--surface-border, #48515e);
  border-radius: 12px;
  background: var(--surface-1, transparent);
  padding: 1.25rem;
}

.panel h2 {
  margin-top: 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 280px), 1fr)
  );
  gap: 1rem;
}

.info-grid > div {
  padding-bottom: .7rem;
  border-bottom: 1px solid var(--surface-border, #48515e);
}

dt {
  color: var(--text-secondary, #9ca3af);
  font-size: .82rem;
}

dd {
  margin: .25rem 0 0;
  overflow-wrap: anywhere;
}

.status,
.counter,
.command-status {
  border-radius: 999px;
  padding: .3rem .65rem;
  font-size: .8rem;
}

.status.online {
  color: #22c55e;
  background: rgba(34, 197, 94, .1);
}

.status.offline {
  color: #9ca3af;
  background: rgba(107, 114, 128, .12);
}

button {
  min-height: 2.5rem;
  border-radius: 7px;
  border: 1px solid var(--surface-border, #48515e);
  padding: .55rem .85rem;
  background: var(--surface-2, rgba(255, 255, 255, .06));
  color: inherit;
  cursor: pointer;
}

.list-item {
  padding: 1rem 0;
  border-top: 1px solid var(--surface-border, #48515e);
}

.list-item:first-of-type {
  margin-top: .75rem;
}

.muted,
.empty,
.loading {
  color: var(--text-secondary, #9ca3af);
}

.muted {
  margin-top: .3rem;
  font-size: .85rem;
}

.metadata {
  margin-top: .7rem;
}

pre {
  overflow: auto;
  padding: .75rem;
  border-radius: 7px;
  background: rgba(0, 0, 0, .15);
}

code {
  overflow-wrap: anywhere;
}

.error,
.command-error {
  color: var(--error-color, #ef4444);
}

@media (max-width: 700px) {
  .device-page {
    width: min(100% - 1rem, 1180px);
  }

  .page-header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>