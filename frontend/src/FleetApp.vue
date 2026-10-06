<template>
  <main class="fleet-page">
    <header class="page-header">
      <div>
        <h1>3mm Fleet</h1>
        <p>{{ t('subtitle') }}</p>
      </div>

      <button
        type="button"
        class="secondary-button"
        :disabled="loading"
        @click="refreshAll"
      >
        {{ loading ? t('refreshing') : t('refresh') }}
      </button>
    </header>

    <p v-if="error" class="error-message" role="alert">
      {{ error }}
    </p>

    <section class="panel">
      <div class="section-header">
        <div>
          <h2>{{ t('newDevices') }}</h2>
          <p>
            {{ t('pendingHelp') }}
          </p>
        </div>

        <span class="counter">{{ pending.length }}</span>
      </div>

      <p v-if="pendingError" class="error-message" role="alert">{{ t('loadFailed') }}</p>

      <p v-if="loadingPending && !pending.length" class="empty">
        {{ t('checking') }}
      </p>

      <p v-else-if="!pendingError && !pending.length" class="empty">
        {{ t('noPending') }}
      </p>

      <article
        v-for="item in pending"
        :key="item.request_id"
        class="pending-card"
      >
        <div class="device-main">
          <strong>{{ item.display_name || t('unnamed') }}</strong>
          <code>{{ item.device_id }}</code>

          <div class="device-meta">
            <span>{{ roleLabel(item.role) }}</span>
            <span>{{ t('protocol') }} {{ item.protocol_version }}</span>
            <span>{{ t('until') }} {{ formatDate(item.expires_at) }}</span>
          </div>
        </div>

        <div class="actions">
          <button
            type="button"
            class="primary-button"
            :disabled="busyRequest !== null"
            @click="decide(item, 'approve')"
          >
            {{ t('add') }}
          </button>

          <button
            type="button"
            class="danger-button"
            :disabled="busyRequest !== null"
            @click="decide(item, 'reject')"
          >
            {{ t('reject') }}
          </button>
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="section-header">
        <div>
          <h2>{{ t('devices') }}</h2>
          <p>{{ t('devicesHelp') }}</p>
        </div>

        <span class="counter">{{ devices.length }}</span>
      </div>

      <p v-if="devicesError" class="error-message" role="alert">{{ t('loadFailed') }}</p>

      <p v-if="loadingDevices && !devices.length" class="empty">
        {{ t('loadingDevices') }}
      </p>

      <p v-else-if="!devicesError && !devices.length" class="empty">
        {{ t('noDevices') }}
      </p>

      <div v-else class="device-grid">
        <article
          v-for="device in devices"
          :key="device.device_id"
          class="device-card"
        >
          <div class="device-card-header">
            <div>
              <div class="device-title-row">
                <span
                  class="status-dot"
                  :class="deviceStatus(device)"
                  aria-hidden="true"
                ></span>

                <strong>
                  {{ device.display_name || inventoryValue(device, 'hostname') || t('unnamed') }}
                </strong>
              </div>

              <code>{{ device.device_id }}</code>
            </div>

            <span
              class="status-badge"
              :class="deviceStatus(device) + '-badge'"
            >
              {{ t(deviceStatus(device)) }}
            </span>
          </div>

          <dl class="device-details">
            <div>
              <dt>{{ t('role') }}</dt>
              <dd>{{ roleLabel(device.role) }}</dd>
            </div>

            <div>
              <dt>{{ t('lastSeen') }}</dt>
              <dd>{{ formatLastSeen(device.last_seen_at) }}</dd>
            </div>

            <div v-if="inventoryValue(device, 'model')">
              <dt>{{ t('model') }}</dt>
              <dd>{{ inventoryValue(device, 'model') }}</dd>
            </div>

            <div v-if="inventoryValue(device, 'operating_system')">
              <dt>{{ t('os') }}</dt>
              <dd>
                {{ inventoryValue(device, 'operating_system') }}
                {{ inventoryValue(device, 'operating_system_version') }}
              </dd>
            </div>

            <div v-if="inventoryValue(device, 'architecture')">
              <dt>{{ t('architecture') }}</dt>
              <dd>{{ inventoryValue(device, 'architecture') }}</dd>
            </div>

            <div v-if="inventoryValue(device, 'kernel_version')">
              <dt>Kernel</dt>
              <dd>{{ inventoryValue(device, 'kernel_version') }}</dd>
            </div>
          </dl>

          <details v-if="device.latest_inventory" class="inventory-details">
            <summary>{{ t('inventory') }}</summary>

            <dl class="inventory-grid">
              <div v-if="inventoryValue(device, 'hostname')">
                <dt>Hostname</dt>
                <dd>{{ inventoryValue(device, 'hostname') }}</dd>
              </div>

              <div v-if="inventoryValue(device, 'python_version')">
                <dt>Python</dt>
                <dd>{{ inventoryValue(device, 'python_version') }}</dd>
              </div>

              <div v-if="inventoryValue(device, 'logical_cpu_count')">
                <dt>CPU</dt>
                <dd>{{ inventoryValue(device, 'logical_cpu_count') }} {{ t('cores') }}</dd>
              </div>

              <div v-if="memoryLabel(device)">
                <dt>RAM</dt>
                <dd>{{ memoryLabel(device) }}</dd>
              </div>

              <div v-if="diskLabel(device)">
                <dt>{{ t('disk') }}</dt>
                <dd>{{ diskLabel(device) }}</dd>
              </div>

              <div>
                <dt>{{ t('protocol') }}</dt>
                <dd>{{ device.protocol_version }}</dd>
              </div>
            </dl>
          </details>
          <router-link
            class="device-detail-link"
            :to="{
              path: '/fleet/device',
              query: { id: device.device_id },
            }"
          >
            {{ t('details') }}
          </router-link>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useFleetApi, useFleetText } from './fleet-ui'

const { requestJson } = useFleetApi()
const { t, formatDate, formatLastSeen, deviceStatus } = useFleetText()

interface PendingRequest {
  request_id: number
  device_id: string
  display_name: string
  role: string
  protocol_version: string
  expires_at: string
}

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

const pending = ref<PendingRequest[]>([])
const devices = ref<DeviceItem[]>([])

const loadingPending = ref(false)
const loadingDevices = ref(false)
const loading = ref(false)

const busyRequest = ref<number | null>(null)
const error = ref('')
const pendingError = ref(false)
const devicesError = ref(false)

let refreshTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false

async function loadPending() {
  if (loadingPending.value || disposed) return

  loadingPending.value = true

  try {
    const result = await requestJson<PendingRequest[]>(
      '/api/v1/pairing/requests?after_id=0&limit=50',
    )
    if (!disposed) { pending.value = result; pendingError.value = false }
  } catch {
    if (!disposed) pendingError.value = true
  } finally {
    loadingPending.value = false
  }
}

async function loadDevices() {
  if (loadingDevices.value || disposed) return

  loadingDevices.value = true

  try {
    const result = await requestJson<DeviceResponse>('/api/v1/devices')
    if (!disposed) { devices.value = result.items; devicesError.value = false }
  } catch {
    if (!disposed) devicesError.value = true
  } finally {
    loadingDevices.value = false
  }
}

async function refreshAll() {
  if (loading.value || disposed) return

  loading.value = true

  try {
    await Promise.allSettled([
      loadPending(),
      loadDevices(),
    ])
  } finally {
    loading.value = false
  }
}

async function decide(
  item: PendingRequest,
  action: 'approve' | 'reject',
) {
  if (busyRequest.value !== null || disposed) return

  busyRequest.value = item.request_id
  error.value = ''

  try {
    await requestJson<void>(
      `/api/v1/pairing/requests/${item.request_id}/${action}`,
      {
        method: 'POST',
      },
    )

    if (!disposed) await refreshAll()
  } catch {
    await refreshAll()
    if (!disposed) error.value = t('decisionFailed')
  } finally {
    busyRequest.value = null
  }
}

function roleLabel(role: string): string {
  if (role === 'node') return 'Node'
  if (role === 'hub') return 'Hub'
  if (role === 'standalone') return 'Standalone'
  return role
}

function inventoryValue(
  device: DeviceItem,
  key: string,
): string {
  const value = device.latest_inventory?.[key]

  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return String(value)
  }

  return ''
}

function formatBytes(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ''
  }

  const gib = value / (1024 ** 3)

  return `${gib.toFixed(1)} GB`
}

function memoryLabel(device: DeviceItem): string {
  return formatBytes(device.latest_inventory?.memory_total_bytes)
}

function diskLabel(device: DeviceItem): string {
  const total = formatBytes(
    device.latest_inventory?.root_total_bytes,
  )

  const free = formatBytes(
    device.latest_inventory?.root_free_bytes,
  )

  if (!total) return ''

  return free
    ? t('freeDisk', { free, total })
    : total
}

async function poll() {
  if (!document.hidden) {
    await refreshAll()
  }

  if (!disposed) {
    refreshTimer = setTimeout(poll, 10000)
  }
}

onMounted(() => {
  void poll()
})

onUnmounted(() => {
  disposed = true

  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }
})
</script>

<style scoped>
.fleet-page {
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1.5rem 0 3rem;
  display: grid;
  gap: 1.5rem;
}

.page-header,
.section-header,
.device-card-header,
.device-title-row,
.actions {
  display: flex;
  align-items: center;
}

.page-header,
.section-header,
.device-card-header {
  justify-content: space-between;
  gap: 1rem;
}

.page-header h1,
.section-header h2 {
  margin: 0;
}

.page-header p,
.section-header p {
  margin: .35rem 0 0;
  color: var(--text-secondary, #9ca3af);
}

.panel {
  border: 1px solid var(--surface-border, #48515e);
  border-radius: 12px;
  background: var(--surface-1, transparent);
  padding: 1.25rem;
}

.counter {
  min-width: 2rem;
  height: 2rem;
  padding: 0 .6rem;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  background: var(--surface-2, rgba(255, 255, 255, .06));
}

.pending-card {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--surface-border, #48515e);
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}

.device-main {
  min-width: 0;
}

.device-main strong {
  display: block;
  font-size: 1.05rem;
}
.device-detail-link {
  display: inline-block;
  margin-top: 1rem;
  color: var(--primary-color, #3b82f6);
  font-weight: 600;
  text-decoration: none;
}

.device-detail-link:hover {
  text-decoration: underline;
}

code {
  display: block;
  margin-top: .25rem;
  font-size: .78rem;
  color: var(--text-secondary, #9ca3af);
  overflow-wrap: anywhere;
}

.device-meta {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem 1rem;
  margin-top: .6rem;
  color: var(--text-secondary, #9ca3af);
  font-size: .85rem;
}

.actions {
  gap: .6rem;
  flex-wrap: wrap;
}

button {
  min-height: 2.5rem;
  border-radius: 7px;
  border: 1px solid var(--surface-border, #48515e);
  padding: .55rem .85rem;
  cursor: pointer;
}

button:disabled {
  opacity: .5;
  cursor: wait;
}

.primary-button {
  background: var(--primary-color, #3b82f6);
  border-color: var(--primary-color, #3b82f6);
  color: white;
}

.secondary-button {
  background: var(--surface-2, rgba(255, 255, 255, .06));
  color: var(--text-primary, inherit);
}

.danger-button {
  background: transparent;
  color: var(--error-color, #ef4444);
}

.device-grid {
  margin-top: 1rem;
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 320px), 1fr)
  );
  gap: 1rem;
}

.device-card {
  border: 1px solid var(--surface-border, #48515e);
  border-radius: 10px;
  padding: 1rem;
  background: var(--surface-2, rgba(255, 255, 255, .025));
}

.device-title-row {
  gap: .55rem;
}

.status-dot {
  width: .7rem;
  height: .7rem;
  flex: 0 0 auto;
  border-radius: 50%;
}

.status-dot.online {
  background: #22c55e;
}

.status-dot.offline {
  background: #6b7280;
}

.status-dot.revoked { background: var(--error-color, #ef4444); }
.revoked-badge { color: var(--error-color, #ef4444); border: 1px solid currentColor; }

.status-badge {
  border-radius: 999px;
  padding: .3rem .65rem;
  font-size: .78rem;
  font-weight: 600;
}

.online-badge {
  color: #22c55e;
  background: rgba(34, 197, 94, .1);
}

.offline-badge {
  color: var(--text-secondary, #9ca3af);
  background: rgba(107, 114, 128, .12);
}

.device-details,
.inventory-grid {
  margin: 1rem 0 0;
  display: grid;
  gap: .7rem;
}

.device-details > div,
.inventory-grid > div {
  display: grid;
  grid-template-columns: minmax(8rem, .7fr) 1fr;
  gap: .75rem;
}

dt {
  color: var(--text-secondary, #9ca3af);
  font-size: .85rem;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.inventory-details {
  margin-top: 1rem;
  border-top: 1px solid var(--surface-border, #48515e);
  padding-top: .9rem;
}

.inventory-details summary {
  cursor: pointer;
  font-weight: 600;
}

.empty {
  margin: 1rem 0 0;
  color: var(--text-secondary, #9ca3af);
}

.error-message {
  margin: 0;
  padding: .8rem 1rem;
  border-radius: 8px;
  color: var(--error-color, #ef4444);
  border: 1px solid currentColor;
}

@media (max-width: 700px) {
  .fleet-page {
    width: min(100% - 1rem, 1180px);
  }

  .page-header,
  .section-header,
  .pending-card {
    align-items: stretch;
    flex-direction: column;
  }

  .actions {
    width: 100%;
  }

  .actions button {
    flex: 1;
  }

  .device-details > div,
  .inventory-grid > div {
    grid-template-columns: 1fr;
    gap: .2rem;
  }
}
</style>
