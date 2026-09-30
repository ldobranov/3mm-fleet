<template>
  <section class="gpio-panel">
    <div class="title-row"><h2>{{ t('gpioConfiguration') }}</h2><button type="button" @click="poll">{{ t('refresh') }}</button></div>
    <p>{{ t('gpioConfigurationHelp') }}</p>
    <p v-if="loadError || !report" class="warning" role="status">{{ t(loadError ? 'loadFailed' : 'gpioUpgradeRequired') }}</p>
    <template v-if="report">
      <p class="current">{{ t('gpioCurrent') }}: {{ report.driver }} · {{ currentMapping }}</p>
      <p v-if="stale" class="warning">{{ t('staleState') }}</p>
      <p v-if="!report.configurable" class="warning">{{ report.error || t('gpioComplexConfiguration') }}</p>
      <p v-if="report.blocking_modules.length" class="warning">{{ t('gpioDisableFirst') }}: {{ report.blocking_modules.join(', ') }}</p>
      <div class="fields">
        <label>{{ t('driver') }}<select v-model="driver" :disabled="Boolean(pending)">
          <option value="mock">{{ t('gpioMock') }}</option>
          <option v-if="report.native_supported" value="gpiod">{{ t('gpioNative') }}</option>
        </select></label>
        <label>{{ t('gpioOutputPin') }}<select v-model.number="pin" :disabled="Boolean(pending)">
          <option v-for="item in report.allowed_pins" :key="item.bcm_pin" :value="item.bcm_pin">GPIO {{ item.bcm_pin }} — {{ t('gpioPhysicalPin', { n: item.physical_pin }) }}</option>
        </select></label>
      </div>
      <p>{{ t(driver === 'mock' ? 'gpioMockWarning' : 'gpioWiringWarning') }}</p>
      <label class="confirmation"><input v-model="confirmed" type="checkbox" /> {{ t('gpioConfigurationConfirmed') }}</label>
      <div class="buttons"><button type="button" :disabled="blocked" @click="apply">{{ t('gpioApply') }}</button>
        <button v-if="pending && uncertain" type="button" :disabled="!confirmed || stale || loadError" @click="review">{{ t('reviewedOutcome') }}</button></div>
    </template>
    <p v-if="pending" role="status">{{ t(uncertain ? 'actionUnconfirmed' : 'waiting') }}</p>
    <p v-if="outcome" role="status">{{ t(outcome) }}</p>
    <p v-if="detail" class="warning" role="status">{{ detail }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { FleetHttpError, useFleetApi, useFleetText } from './fleet-ui'
const props = defineProps<{ deviceId: string; disabled: boolean }>()
const emit = defineEmits<{ pendingChange: [value: boolean]; completed: [] }>()
const { requestJson } = useFleetApi()
const { t } = useFleetText()
type Report = { schema_version: number; revision: string; driver: 'mock' | 'gpiod';
  outputs: Record<string, number>; configurable: boolean; native_supported: boolean;
  allowed_pins: { bcm_pin: number; physical_pin: number }[]; blocking_modules: string[]; error: string | null }
type Pending = { key: string; commandId: string | null }
type Command = { command_id: string; idempotency_key: string; status: string;
  error?: string; result?: { output?: { execution_state?: string } } }
const report = ref<Report | null>(null), reportedAt = ref(''), now = ref(Date.now()), loadError = ref(false)
const driver = ref<'mock' | 'gpiod'>('mock'), pin = ref(17), confirmed = ref(false)
const pending = ref<Pending | null>(null), uncertain = ref(false)
const outcome = ref<'succeeded' | 'actionFailed' | 'localStateFailed' | ''>(''), detail = ref('')
const base = `/api/v1/devices/${encodeURIComponent(props.deviceId)}`
const storageKey = `3mm.fleet.gpio-configuration:${props.deviceId}`
let disposed = false, polling = false
let timer: ReturnType<typeof setTimeout> | undefined
const stale = computed(() => !Number.isFinite(Date.parse(reportedAt.value)) || now.value - Date.parse(reportedAt.value) > 90000)
const blocked = computed(() => props.disabled || !confirmed.value || Boolean(pending.value) || loadError.value || stale.value
  || !report.value?.configurable || Boolean(report.value?.blocking_modules.length)
  || !report.value?.allowed_pins.some(item => item.bcm_pin === pin.value)
  || (driver.value === 'gpiod' && !report.value?.native_supported))
const currentMapping = computed(() => {
  if (report.value?.driver === 'mock') return t('gpioNoPhysicalPin')
  const bcm = report.value?.outputs['gpio.output.1']
  const physical = report.value?.allowed_pins.find(item => item.bcm_pin === bcm)?.physical_pin
  return bcm === undefined ? '—' : `GPIO ${bcm}${physical ? ` — ${t('gpioPhysicalPin', { n: physical })}` : ''}`
})
function save(value: Pending | null) {
  if (value) localStorage.setItem(storageKey, JSON.stringify(value))
  else localStorage.removeItem(storageKey)
  pending.value = value; emit('pendingChange', Boolean(value))
}
async function readReport(reset = false) {
  try {
    const state = await requestJson<{ reported_state: { gpio_configuration?: Report }; reported_at: string | null }>(`${base}/state`)
    if (disposed) return
    const value = state.reported_state.gpio_configuration
    if (value && (value.schema_version !== 1 || !/^[0-9a-f]{64}$/.test(value.revision)
      || !Array.isArray(value.allowed_pins) || !Array.isArray(value.blocking_modules))) throw new Error('Invalid report')
    if (value && (!report.value || reset || value.revision !== report.value.revision)) {
      driver.value = value.driver; pin.value = value.outputs['gpio.output.1'] || 17; confirmed.value = false
    }
    report.value = value || null; reportedAt.value = state.reported_at || ''; loadError.value = false
  } catch { if (!disposed) loadError.value = true }
}
async function reconcile() {
  const operation = pending.value
  if (!operation) return
  try {
    const history = await requestJson<{ items: Command[] }>(`${base}/commands?limit=200`)
    if (disposed || pending.value !== operation) return
    const command = history.items.find(item => operation.commandId ? item.command_id === operation.commandId : item.idempotency_key === operation.key)
    if (!command) { uncertain.value = true; return }
    save({ ...operation, commandId: command.command_id })
    const unknown = command.status === 'unknown' || command.result?.output?.execution_state === 'unknown'
    uncertain.value = unknown
    if (!unknown && ['succeeded', 'failed', 'expired', 'cancelled'].includes(command.status)) {
      outcome.value = command.status === 'succeeded' ? 'succeeded' : 'actionFailed'
      detail.value = command.error || ''; save(null); confirmed.value = false
      await readReport(true); emit('completed')
    }
  } catch { if (!disposed) uncertain.value = true }
}
async function apply() {
  if (blocked.value || !report.value) return
  const key = `fleet:${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`
  outcome.value = ''; detail.value = ''; uncertain.value = false
  try { save({ key, commandId: null }) } catch { outcome.value = 'localStateFailed'; return }
  try {
    const command = await requestJson<Command>(`${base}/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command_type: 'agent.gpio.configure', idempotency_key: key, ttl_seconds: 10,
        payload: { expected_revision: report.value.revision, confirmed_safe: true,
          configuration: { schema_version: 1, driver: driver.value, bcm_pin: pin.value } } }) })
    if (!disposed) save({ key, commandId: command.command_id })
  } catch (reason) {
    if (!disposed) {
      if (reason instanceof FleetHttpError && reason.status >= 400 && reason.status < 500) { save(null); outcome.value = 'actionFailed' }
      else uncertain.value = true
    }
  }
  if (!disposed) await poll()
}
function review() {
  if (!confirmed.value || stale.value || loadError.value || !uncertain.value) return
  try { save(null); uncertain.value = false; confirmed.value = false; detail.value = '' }
  catch { outcome.value = 'localStateFailed' }
}
async function poll() {
  if (polling || disposed) return
  if (timer) clearTimeout(timer)
  polling = true; now.value = Date.now()
  try { if (!document.hidden) { await reconcile(); await readReport() } }
  finally { polling = false; if (!disposed) timer = setTimeout(poll, pending.value ? 2000 : 10000) }
}
onMounted(() => {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const value = JSON.parse(raw)
      if (!/^fleet:[0-9a-f]{32}$/.test(value.key) || !(value.commandId === null || typeof value.commandId === 'string')) throw new Error('Invalid intent')
      pending.value = value; uncertain.value = true; emit('pendingChange', true)
    }
  } catch { pending.value = { key: '', commandId: null }; uncertain.value = true; emit('pendingChange', true) }
  void poll()
})
onUnmounted(() => { disposed = true; if (timer) clearTimeout(timer) })
</script>

<style scoped>
.gpio-panel { border: 1px solid var(--surface-border, #48515e); border-radius: 12px; background: var(--surface-1, transparent); padding: 1.25rem; min-width: 0; }
.title-row, .fields, .buttons { display: flex; flex-wrap: wrap; gap: .75rem; }
.title-row { align-items: center; justify-content: space-between; }
h2 { margin: 0; }
p { overflow-wrap: anywhere; }
.fields label { display: grid; gap: .4rem; flex: 1 1 220px; min-width: 0; }
.confirmation { display: flex; align-items: flex-start; gap: .5rem; }
.confirmation input { margin-top: .25rem; flex-shrink: 0; }
.buttons { margin-top: .85rem; }
select, button { border: 1px solid var(--input-border, var(--surface-border, #48515e)); background: var(--input-bg, var(--surface-2, transparent)); color: var(--text-primary, inherit); border-radius: 7px; font: inherit; padding: .55rem .75rem; min-height: 2.5rem; }
select { width: 100%; }
button:disabled { opacity: .5; cursor: not-allowed; }
.warning { border-left: 3px solid var(--warning-color, #d9962d); padding-left: .65rem; }
.current { font-weight: 600; }
</style>
