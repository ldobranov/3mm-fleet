<template>
  <main class="device-page">
    <header class="page-header">
      <div>
        <a class="back-link" href="/fleet">{{ t('back') }}</a>

        <h1>
          {{ device?.display_name || inventoryValue('hostname') || t('device') }}
        </h1>

        <code>{{ deviceId }}</code>
      </div>

      <div class="header-actions">
        <span
          v-if="device"
          class="status"
          :class="deviceStatus(device)"
        >
          {{ t(deviceStatus(device)) }}
        </span>

        <button
          type="button"
          :disabled="loading"
          @click="refresh"
        >
          {{ loading ? t('refreshing') : t('refresh') }}
        </button>
      </div>
    </header>

    <p v-if="error" class="error" role="alert">
      {{ error }}
    </p>

    <p v-if="loading && !device" class="loading">
      {{ t('loadingDevice') }}
    </p>

    <template v-if="device">
      <section class="panel">
        <h2>{{ t('general') }}</h2>

        <dl class="info-grid">
          <div>
            <dt>{{ t('name') }}</dt>
            <dd>{{ device.display_name || '—' }}</dd>
          </div>

          <div>
            <dt>Device ID</dt>
            <dd><code>{{ device.device_id }}</code></dd>
          </div>

          <div>
            <dt>{{ t('role') }}</dt>
            <dd>{{ roleLabel(device.role) }}</dd>
          </div>

          <div>
            <dt>{{ t('protocol') }}</dt>
            <dd>{{ device.protocol_version }}</dd>
          </div>

          <div>
            <dt>{{ t('status') }}</dt>
            <dd>{{ t(deviceStatus(device)) }}</dd>
          </div>

          <div>
            <dt>{{ t('lastSeen') }}</dt>
            <dd>{{ formatLastSeen(device.last_seen_at) }}</dd>
          </div>

          <div>
            <dt>{{ t('approved') }}</dt>
            <dd>{{ formatDate(device.approved_at) }}</dd>
          </div>
        </dl>
      </section>

      <section class="panel">
        <h2>{{ t('hardware') }}</h2>

        <p v-if="!device.latest_inventory" class="empty">
          {{ t('noInventory') }}
        </p>

        <dl v-else class="info-grid">
          <div>
            <dt>Hostname</dt>
            <dd>{{ inventoryValue('hostname') || '—' }}</dd>
          </div>

          <div>
            <dt>{{ t('model') }}</dt>
            <dd>{{ inventoryValue('model') || '—' }}</dd>
          </div>

          <div>
            <dt>{{ t('os') }}</dt>
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
            <dt>{{ t('architecture') }}</dt>
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
              <span v-if="inventoryValue('logical_cpu_count')"> {{ t('cores') }}</span>
            </dd>
          </div>

          <div>
            <dt>RAM</dt>
            <dd>{{ formatBytes(device.latest_inventory.memory_total_bytes) || '—' }}</dd>
          </div>

          <div>
            <dt>{{ t('freeSpace') }}</dt>
            <dd>{{ formatBytes(device.latest_inventory.root_free_bytes) || '—' }}</dd>
          </div>

          <div>
            <dt>{{ t('totalSpace') }}</dt>
            <dd>{{ formatBytes(device.latest_inventory.root_total_bytes) || '—' }}</dd>
          </div>

          <div>
            <dt>NetworkManager</dt>
            <dd>
              {{
                device.latest_inventory.network_manager_active === true
                  ? t('active')
                  : device.latest_inventory.network_manager_active === false
                    ? t('inactive')
                    : '—'
              }}
            </dd>
          </div>

          <div>
            <dt>{{ t('driver') }}</dt>
            <dd>{{ inventoryValue('hardware_driver') || '—' }}</dd>
          </div>
        </dl>
      </section>

    </template>
    <NodeUpdateControl
      v-if="device && device.role === 'node'"
      :device-id="deviceId"
      :disabled="
        !device.online ||
        Boolean(device.revoked_at) ||
        Boolean(error) ||
        gpioBusy ||
        capabilityBusy() ||
        busyModule !== null ||
        Object.keys(pendingOperations).length > 0
      "
      @pending-change="nodeUpdateBusy = $event"
      @completed="refresh"
    />

    <GpioConfiguration
      v-if="device"
      :device-id="deviceId"
      :disabled="
        !device.online ||
        Boolean(device.revoked_at) ||
        Boolean(error) ||
        nodeUpdateBusy ||
        busyModule !== null ||
        Object.keys(pendingOperations).length > 0
      "
      @pending-change="gpioBusy = $event"
      @completed="refresh"
    />
    <p v-if="device?.revoked_at" class="error" role="status">{{ t('revokedHelp') }}</p>
      <section class="panel">
        <div class="section-header">
          <div>
            <h2>{{ t('capabilities') }}</h2>
            <p>{{ t('capabilitiesHelp') }}</p>
          </div>

        <span class="counter">{{ capabilities.length }}</span>
        </div>

        <p v-if="capabilitiesError" class="error" role="alert">{{ t('loadFailed') }}</p>

        <p v-if="!capabilitiesError && !capabilities.length" class="empty">
          {{ t('noCapabilities') }}
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

          <CapabilityControl
            :device-id="deviceId"
            :capability-id="capability.capability_id"
            :metadata="capability.metadata || {}"
            :disabled="
              !device ||
              !device.online ||
              Boolean(device.revoked_at) ||
              Boolean(error) ||
              capabilitiesError ||
              nodeUpdateBusy ||
              isPending(capability.module_id)
            "
            @completed="refresh"
            @pending-change="
              setCapabilityBusy(
                capability.capability_id,
                $event,
              )
            "
          />

          <details
            v-if="Object.keys(capability.metadata || {}).length"
            class="metadata"
          >
            <summary>{{ t('metadata') }}</summary>
            <pre>{{ JSON.stringify(capability.metadata, null, 2) }}</pre>
          </details>
        </article>
      </section>
		<section v-if="device" class="panel">
		  <div class="section-header">
			<div>
			  <h2>{{ t('modules') }}</h2>
			  <p>{{ t('modulesHelp') }}</p>
			</div>

			<span class="counter">{{ device.modules.length }}</span>
		  </div>

		  <p v-if="moduleError" class="command-error">
			{{ t(moduleError) }}
		  </p>
          <p v-if="packagesError" class="error" role="alert">{{ t('loadFailed') }}</p>

		  <p
			v-if="!packagesError && !device.modules.length && !availablePackages().length"
			class="empty"
		  >
			{{ t('noModules') }}
		  </p>

		  <article
			v-for="module in device.modules"
			:key="module.module_id"
			class="list-item"
		  >
			<div class="command-header">
			  <div>
				<strong>{{ module.module_id }}</strong>

				<div class="muted">
				  {{ t('installed') }}:
				  {{ module.installed_version || '—' }}
				</div>

				<div class="muted">
				  {{ t('desired') }}:
				  {{ module.desired_version }}
				</div>
			  </div>

			  <span class="command-status">
				{{ isPending(module.module_id) ? t('waiting') : module.enabled ? t('enabled') : t('disabled') }}
			  </span>
			</div>

			<div class="muted">
			  {{ t('status') }}: {{ operationStatus(module) }}
			</div>

			<div
			  v-if="hasUpdate(module)"
			  class="update-notice"
			>
			  {{ t('updateAvailable') }}:
			  {{ latestPackage(module.module_id)?.version }}
			</div>

			<div v-if="module.error" class="command-error">
			  {{ module.error }}
			</div>

			<div class="module-actions">
			  <button v-if="!module.enabled && installedPackage(module)" type="button"
			    :disabled="actionsDisabled(module.module_id)" @click="enableModule(module)">{{ t('enable') }}</button>
			  <button
				v-if="hasUpdate(module)"
				type="button"
				:disabled="actionsDisabled(module.module_id)"
				@click="updateModule(module)"
			  >
				{{
				  busyModule === module.module_id
					? t('sending')
					: t('update')
				}}
			  </button>

			  <button
				v-if="module.enabled"
				type="button"
				class="danger-button"
				:disabled="actionsDisabled(module.module_id)"
				@click="disableModule(module)"
			  >
				{{ t('disable') }}
			  </button>
			</div>
		  </article>

		  <template v-if="availablePackages().length">
			<h3 class="available-title">
			  {{ t('available') }}
			</h3>

			<article
			  v-for="pkg in availablePackages()"
			  :key="`${pkg.module_id}-${pkg.version}`"
			  class="list-item"
			>
			  <div class="command-header">
				<div>
				  <strong>
					{{ pkg.manifest.name || pkg.module_id }}
				  </strong>

				  <div class="muted">
					{{ pkg.module_id }}
				  </div>

				  <div class="muted">
					{{ t('version') }} {{ pkg.version }}
				  </div>
				</div>

				<button
				  type="button"
				  :disabled="actionsDisabled(pkg.module_id)"
				  @click="installPackage(pkg)"
				>
				  {{
					busyModule === pkg.module_id
					  ? t('sending')
					  : isPending(pkg.module_id) ? t('waiting') : t('install')
				  }}
				</button>
			  </div>
			</article>
		  </template>
		</section>
      <section class="panel">
        <div class="section-header">
          <div>
            <h2>{{ t('commands') }}</h2>
            <p>{{ t('commandsHelp') }}</p>
          </div>

        <span class="counter">{{ commands.length }}</span>
        </div>

        <p v-if="commandsError" class="error" role="alert">{{ t('loadFailed') }}</p>

        <p v-if="!commandsError && !commands.length" class="empty">
          {{ t('noCommands') }}
        </p>

        <article
          v-for="command in commands"
          :key="command.command_id"
          class="list-item"
        >
          <div class="command-header">
            <strong>{{ command.command_type }}</strong>

            <span class="command-status">
              {{ statusLabel(command.status) }}
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
            <summary>{{ t('result') }}</summary>
            <pre>{{ JSON.stringify(command.result, null, 2) }}</pre>
          </details>
        </article>
      </section>
    <section v-if="!loading && !device && !error" class="panel">
      {{ t('notFound') }}
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { FleetHttpError, useFleetApi, useFleetText } from './fleet-ui'
import CapabilityControl from './CapabilityControl.vue'
import GpioConfiguration from './GpioConfiguration.vue'
import NodeUpdateControl from './NodeUpdateControl.vue'

const { requestJson } = useFleetApi()
const { t, formatDate, formatLastSeen, deviceStatus } = useFleetText()

interface DeviceModule {
  module_id: string
  installed_version: string | null
  desired_version: string
  status: string
  enabled: boolean
  error: string | null
}

interface ModulePackage {
  module_id: string
  version: string
  sha256: string
  size_bytes: number
  manifest: {
    name?: string
    runtimes?: string[]
    entrypoints?: Record<string, string>
  }
  registrations: Record<string, unknown>[]
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
  modules: DeviceModule[]
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

const packages = ref<ModulePackage[]>([])
const busyModule = ref<string | null>(null)
const gpioBusy = ref(false)
const nodeUpdateBusy = ref(false)
const moduleError = ref<'actionUnconfirmed' | 'actionFailed' | ''>('')
const capabilitiesError = ref(false)
const commandsError = ref(false)
const packagesError = ref(false)
const pendingOperations = ref<Record<string, { commandId: string | null; key: string }>>({})
const pendingCapabilities = ref<Record<string, boolean>>({})

let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false

function statusLabel(status: string) {
  const labels = ['queued', 'delivered', 'succeeded', 'failed', 'expired', 'unknown'] as const
  const key = labels.find(key => key === status)
  return key ? t(key) : status
}

function setCapabilityBusy(
  capabilityId: string,
  value: boolean,
) {
  const next = {
    ...pendingCapabilities.value,
  }

  if (value) {
    next[capabilityId] = true
  } else {
    delete next[capabilityId]
  }

  pendingCapabilities.value = next
}

function capabilityBusy(): boolean {
  return Object.keys(
    pendingCapabilities.value,
  ).length > 0
}

function isPending(moduleId: string) {
  if (moduleId in pendingOperations.value) return true
  return device.value?.modules.some(item => item.module_id === moduleId && ['queued', 'delivered'].includes(item.status)) === true
}

function actionsDisabled(moduleId: string) {
  return (
    loading.value ||
    gpioBusy.value ||
    nodeUpdateBusy.value ||
    busyModule.value !== null ||
    isPending(moduleId) ||
    Boolean(device.value?.revoked_at) ||
    Boolean(error.value)
  )
}

function operationStatus(module: DeviceModule) {
  return isPending(module.module_id) ? t('waiting') : statusLabel(module.status)
}

async function sendModuleAction(moduleId: string, path: string, _legacyKey: string) {
  if (actionsDisabled(moduleId) || disposed) return
  busyModule.value = moduleId
  const key = `fleet:${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`
  moduleError.value = ''
  pendingOperations.value[moduleId] = { commandId: null, key }
  try {
    const result = await requestJson<{ command_id: string; status: string }>(path, { method: 'POST', headers: { 'Idempotency-Key': key } })
    if (!disposed) {
      pendingOperations.value[moduleId] = { commandId: result.command_id, key }
      if (['succeeded', 'failed', 'expired'].includes(result.status)) {
        delete pendingOperations.value[moduleId]
        if (result.status !== 'succeeded') moduleError.value = 'actionFailed'
      }
    }
  } catch (reason) {
    // A timeout is not proof the POST failed. Keep the action locked until reconciled.
    if (!disposed) {
      if (reason instanceof FleetHttpError && reason.status >= 400 && reason.status < 500) {
        delete pendingOperations.value[moduleId]
        moduleError.value = 'actionFailed'
      } else moduleError.value = 'actionUnconfirmed'
    }
  } finally {
    busyModule.value = null
  }
  if (!disposed) await refresh()
}

function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .split('-', 1)[0]
      .split('.')
      .map(part => Number(part))

  const left = parse(a)
  const right = parse(b)

  for (let i = 0; i < 3; i += 1) {
    const l = left[i] || 0
    const r = right[i] || 0

    if (l < r) return -1
    if (l > r) return 1
  }

  return 0
}

function latestPackage(moduleId: string): ModulePackage | null {
  const candidates = packages.value
    .filter(item => item.module_id === moduleId)
    .sort((a, b) => compareVersions(b.version, a.version))

  return candidates[0] || null
}

function availablePackages(): ModulePackage[] {
  if (!device.value) return []

  const installed = new Set(
    device.value.modules.map(item => item.module_id),
  )

  const latestByModule = new Map<string, ModulePackage>()

  for (const item of packages.value) {
    if (installed.has(item.module_id)) continue

    const current = latestByModule.get(item.module_id)

    if (
      !current ||
      compareVersions(current.version, item.version) < 0
    ) {
      latestByModule.set(item.module_id, item)
    }
  }

  return Array.from(latestByModule.values())
    .sort((a, b) => a.module_id.localeCompare(b.module_id))
}

function hasUpdate(module: DeviceModule): boolean {
  if (!module.installed_version) return false

  const latest = latestPackage(module.module_id)

  return Boolean(
    latest &&
    compareVersions(
      module.installed_version,
      latest.version,
    ) < 0,
  )
}

async function installPackage(pkg: ModulePackage) {
  await sendModuleAction(pkg.module_id,
      `/api/v1/modules/packages/${encodeURIComponent(pkg.sha256)}` +
      `/devices/${encodeURIComponent(deviceId)}/install`,
      `module.install:${pkg.module_id}:${pkg.sha256}`,
  )
}

function installedPackage(module: DeviceModule) {
  return packages.value.find(item => item.module_id === module.module_id && item.version === module.installed_version)
}
async function enableModule(module: DeviceModule) {
  const pkg = installedPackage(module)
  if (pkg) await installPackage(pkg)
}

async function updateModule(module: DeviceModule) {
  const pkg = latestPackage(module.module_id)

  if (!pkg) return

  await installPackage(pkg)
}

async function disableModule(module: DeviceModule) {
  await sendModuleAction(module.module_id,
      `/api/v1/modules/${encodeURIComponent(module.module_id)}` +
      `/devices/${encodeURIComponent(deviceId)}/disable`,
      `module.disable:${module.module_id}:${module.installed_version}`,
  )
}

async function refresh() {
  if (loading.value || disposed || !deviceId) return

  loading.value = true

  await Promise.allSettled([
    requestJson<DeviceItem>(`/api/v1/devices/${encodeURIComponent(deviceId)}`).then(result => {
      if (disposed) return
      device.value = result
      error.value = ''
    }).catch(() => { if (!disposed) error.value = t('loadFailed') }),
    requestJson<Capability[]>(`/api/v1/devices/${encodeURIComponent(deviceId)}/capabilities`).then(result => {
      if (!disposed) { capabilities.value = result; capabilitiesError.value = false }
    }).catch(() => { if (!disposed) capabilitiesError.value = true }),
    requestJson<CommandResponse>(`/api/v1/devices/${encodeURIComponent(deviceId)}/commands?limit=200`).then(result => {
      if (!disposed) { commands.value = result.items; commandsError.value = false }
    }).catch(() => { if (!disposed) commandsError.value = true }),
    requestJson<ModulePackage[]>('/api/v1/modules/packages').then(result => {
      if (!disposed) { packages.value = result.filter(item => item.manifest.runtimes?.includes('agent')); packagesError.value = false }
    }).catch(() => { if (!disposed) packagesError.value = true }),
  ])
  // Only a known command's terminal result confirms a requested action.
  if (!disposed && !commandsError.value) {
    for (const [moduleId, operation] of Object.entries(pendingOperations.value)) {
      const command = commands.value.find(item => operation.commandId
        ? item.command_id === operation.commandId : item.idempotency_key.endsWith(`:${operation.key}`))
      if (command) operation.commandId = command.command_id
      if (command && ['succeeded', 'failed', 'expired'].includes(command.status)) {
        delete pendingOperations.value[moduleId]
        if (command.status !== 'succeeded') moduleError.value = 'actionFailed'
        else if (moduleError.value === 'actionUnconfirmed') moduleError.value = ''
      }
    }
  }
  loading.value = false
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
    error.value = t('missingId')
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

.module-actions {
  display: flex;
  gap: .6rem;
  margin-top: .8rem;
  flex-wrap: wrap;
}

.update-notice {
  margin-top: .6rem;
  color: #f59e0b;
  font-weight: 600;
}

.available-title {
  margin: 1.25rem 0 .25rem;
}

.danger-button {
  background: transparent;
  color: var(--error-color, #ef4444);
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

.status.revoked { color: var(--error-color, #ef4444); border: 1px solid currentColor; }
button:disabled { opacity: .5; cursor: not-allowed; }

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
