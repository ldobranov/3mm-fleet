<template>
  <div class="capability-control">
    <p v-if="stateError" class="muted" role="status">{{ t(stateError) }}</p>
    <template v-if="snapshot">
      <dl class="state-grid">
        <div v-for="(value, channel) in snapshot.values" :key="channel">
          <dt>{{ channel }}</dt>
          <dd :class="{ 'value-on': value === true }">
            {{ typeof value === 'boolean' ? t(value ? 'valueOn' : 'valueOff') : value }}
          </dd>
        </div>
      </dl>
      <p class="muted">{{ t('observed') }}: {{ formatDate(snapshot.observed_at) }}</p>
      <p v-if="stale" class="warning" role="status">{{ t('staleState') }}</p>
    </template>
    <div v-if="actions.length && channels.length" class="controls">
      <p class="warning">{{ t('hardwareWarning') }}</p>
      <label class="confirmation">
        <input v-model="confirmed" type="checkbox" /> {{ t('hardwareConfirmed') }}
      </label>
      <div class="control-fields">
        <label>{{ t('channel') }}
          <select v-model="channel" :disabled="Boolean(pending)">
            <option v-for="item in channels" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label v-if="actions.includes('pulse_output')">{{ t('pulseDuration') }}
          <input v-model.number="duration" type="number" min="50" max="10000" step="50" :disabled="Boolean(pending)" />
        </label>
      </div>
      <div class="action-buttons">
        <template v-if="actions.includes('set_output')">
          <button type="button" :disabled="blocked" @click="invoke('set_output', true)">{{ t('switchOn') }}</button>
          <button type="button" :disabled="blocked" @click="invoke('set_output', false)">{{ t('switchOff') }}</button>
        </template>
        <button v-if="actions.includes('pulse_output')" type="button" :disabled="blocked || !validDuration" @click="invoke('pulse_output')">{{ t('pulse') }}</button>
      </div>
      <p v-if="!validDuration" class="warning">{{ t('durationRange') }}</p>
      <p v-if="pending" role="status">{{ t(uncertain ? 'actionUnconfirmed' : 'waiting') }}</p>
      <p v-if="outcome" role="status">{{ t(outcome) }}</p>
      <button v-if="pending && uncertain" type="button" :disabled="!confirmed" @click="reviewOutcome">{{ t('reviewedOutcome') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { FleetHttpError, useFleetApi, useFleetText } from './fleet-ui'

const props = defineProps<{
  deviceId: string
  capabilityId: string
  metadata: Record<string, unknown>
  contractVersion: string | null
  disabled: boolean
}>()
const emit = defineEmits<{
  completed: []
  'pending-change': [value: boolean]
}>()
const { requestJson } = useFleetApi()
const { t, formatDate } = useFleetText()
type Snapshot = { values: Record<string, string | number | boolean>; observed_at: string }
type Pending = { key: string; commandId: string | null }
type Command = { command_id: string; idempotency_key: string; status: string }
const snapshot = ref<Snapshot | null>(null)
const stateError = ref<'stateMissing' | 'loadFailed' | ''>('')
const outcome = ref<'succeeded' | 'actionFailed' | 'localStateFailed' | ''>('')
const now = ref(Date.now())
const confirmed = ref(false)
const channel = ref('')
const duration = ref(250)
const pending = ref<Pending | null>(null)
const uncertain = ref(false)
let disposed = false
let timer: ReturnType<typeof setTimeout> | undefined
const base = `/api/v1/devices/${encodeURIComponent(props.deviceId)}`
const storageKey = `3mm.fleet.pending:${props.deviceId}:${props.capabilityId}`
const csv = (value: unknown) => typeof value === 'string'
  ? [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))].slice(0, 64) : []
const actions = computed(() => csv(props.metadata.automation_actions).filter(action => ['set_output', 'pulse_output'].includes(action)))
const channels = computed(() => csv(props.metadata.automation_channels))
watch(channels, items => { if (!items.includes(channel.value)) channel.value = items[0] || '' }, { immediate: true })
const validDuration = computed(() => Number.isInteger(duration.value) && duration.value >= 50 && duration.value <= 10000)
const stale = computed(() => !snapshot.value || !Number.isFinite(Date.parse(snapshot.value.observed_at)) || now.value - Date.parse(snapshot.value.observed_at) > 90000)
const blocked = computed(() => props.disabled || !confirmed.value || Boolean(pending.value) || Boolean(stateError.value) || stale.value || !channels.value.includes(channel.value))
watch( pending, value => emit('pending-change', Boolean(value)), { immediate: true }, )
function savePending(value: Pending | null) {
  // Persist intent before POST; a page reload must not silently unlock uncertain I/O.
  if (value) localStorage.setItem(storageKey, JSON.stringify(value))
  else localStorage.removeItem(storageKey)
  pending.value = value
}

async function readState() {
  try {
    const value = await requestJson<Snapshot>(`${base}/capabilities/${encodeURIComponent(props.capabilityId)}/state`)
    if (!disposed) { snapshot.value = value; stateError.value = '' }
  } catch (reason) {
    if (!disposed) stateError.value = reason instanceof FleetHttpError && reason.status === 404 ? 'stateMissing' : 'loadFailed'
  }
}

async function reconcile() {
  if (!pending.value) return
  const operation = pending.value
  try {
    const history = await requestJson<{ items: Command[] }>(`${base}/commands?limit=200`)
    if (disposed || pending.value !== operation) return
    const command = history.items.find(item => operation.commandId
      ? item.command_id === operation.commandId : item.idempotency_key === operation.key)
    if (!command) { uncertain.value = true; return }
    savePending({ ...operation, commandId: command.command_id })
    uncertain.value = command.status === 'unknown'
    if (['succeeded', 'failed', 'expired', 'cancelled'].includes(command.status)) {
      outcome.value = command.status === 'succeeded' ? 'succeeded' : 'actionFailed'
      savePending(null)
      emit('completed')
    }
  } catch { if (!disposed) uncertain.value = true }
}

async function invoke(action: 'set_output' | 'pulse_output', value?: boolean) {
  if (blocked.value || !actions.value.includes(action) || (action === 'pulse_output' && !validDuration.value)) return
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  const key = `fleet:${random}`
  outcome.value = ''; uncertain.value = false
  try { savePending({ key, commandId: null }) }
  catch { outcome.value = 'localStateFailed'; return }
  const arguments_ = action === 'set_output' ? { channel: channel.value, value }
    : { channel: channel.value, duration_ms: duration.value }
  try {
    // Existing administrator command API supplies both a short deadline and
    // client-owned idempotency identity. Never queue an offline five-minute pulse.
    const command = await requestJson<Command>(`${base}/commands`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command_type: 'capability.invoke',
        payload: { capability_id: props.capabilityId, action, arguments: arguments_, ...(props.contractVersion ? { contract_version: props.contractVersion } : {}), },
        idempotency_key: key, ttl_seconds: 5 }),
    })
    if (!disposed) savePending({ key, commandId: command.command_id })
  } catch (reason) {
    if (!disposed) {
      if (reason instanceof FleetHttpError && reason.status >= 400 && reason.status < 500) {
        try { savePending(null) } catch { /* Keep pending if durable storage fails. */ }
        outcome.value = 'actionFailed'
      } else uncertain.value = true
    }
  }
  if (!disposed) { await reconcile(); await readState() }
}

function reviewOutcome() {
  // This acknowledges operator inspection only; it does not resolve or replay
  // the Core command, and does not claim that physical execution succeeded.
  if (!confirmed.value || !uncertain.value) return
  try { savePending(null); uncertain.value = false; outcome.value = '' }
  catch { outcome.value = 'localStateFailed' }
}

async function poll() {
  now.value = Date.now()
  if (!document.hidden) { await reconcile(); await readState() }
  if (!disposed) timer = setTimeout(poll, pending.value ? 2000 : 10000)
}
onMounted(() => {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const value = JSON.parse(stored)
      if (typeof value.key !== 'string' || !/^fleet:[0-9a-f]{32}$/.test(value.key)
        || !(value.commandId === null || typeof value.commandId === 'string')) throw new Error('Invalid intent')
      pending.value = value; uncertain.value = true
    }
  } catch { pending.value = { key: '', commandId: null }; uncertain.value = true }
  void poll()
})
onUnmounted(() => {
  disposed = true
  emit('pending-change', false)

  if (timer) {
    clearTimeout(timer)
  }
})

</script>

<style scoped>
.capability-control { margin-top: .8rem; }
.state-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: .75rem; }
dt { overflow-wrap: anywhere; font-size: .85rem; }
dd { margin: .3rem 0 0; font-weight: 600; }
.value-on { color: var(--success-color, #22c55e); }
.muted { color: var(--text-secondary, #9ca3af); font-size: .85rem; }
.warning { color: var(--text-color, inherit); border-left: 3px solid var(--warning-color, #d9962d); padding-left: .65rem; }
.controls { border-top: 1px solid var(--surface-border, #48515e); margin-top: .8rem; padding-top: .5rem; }
.confirmation { display: flex; align-items: flex-start; gap: .5rem; }
.confirmation input { flex-shrink: 0; margin-top: .25rem; }
.control-fields, .action-buttons { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .8rem; }
.control-fields label { display: grid; gap: .3rem; flex: 1 1 170px; min-width: 0; }
select, input[type="number"], button { min-height: 2.5rem; border: 1px solid var(--input-border, var(--surface-border, #48515e)); border-radius: 7px; padding: .5rem .7rem; background: var(--input-bg, var(--surface-2, transparent)); color: var(--text-primary, inherit); font: inherit; }
select, input[type="number"] { width: 100%; box-sizing: border-box; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
</style>
