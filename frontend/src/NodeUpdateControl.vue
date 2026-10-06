<template>
  <section class="panel node-update-panel">
    <div class="section-header">
      <div>
        <h2>{{ t('nodeUpdate') }}</h2>
        <p>{{ t('nodeUpdateHelp') }}</p>
      </div>

      <span
        v-if="status || idleStatusText"
        class="update-status"
        :class="status ? statusClass : idleStatusClass"
      >
        {{ status ? statusText : idleStatusText }}
      </span>
    </div>

    <p v-if="error" class="error" role="alert">
      {{ error }}
    </p>

    <div
      v-if="updateCheck && !status"
      class="update-info"
    >
      <div>
        <span>{{ t('nodeUpdateCurrent') }}</span>
        <strong>
          {{
            updateCheck.current_release_id ||
            t('nodeUpdateCurrentUnknown')
          }}
        </strong>
      </div>

      <div>
        <span>{{ t('nodeUpdateLatest') }}</span>
        <strong>{{ updateCheck.latest_release_id }}</strong>
      </div>
    </div>

    <div v-if="status" class="update-info">
      <div>
        <span>{{ t('nodeUpdateTarget') }}</span>
        <strong>{{ status.release_id }}</strong>
      </div>

      <div>
        <span>{{ t('nodeUpdateSize') }}</span>
        <strong>{{ formatBytes(status.archive_size_bytes) }}</strong>
      </div>

      <div>
        <span>{{ t('nodeUpdateOperation') }}</span>
        <code>{{ status.operation_id }}</code>
      </div>
    </div>

    <div
      v-if="status?.installation"
      class="installation-result"
      :class="status.installation.status"
    >
      <strong>
        {{ installationText(status.installation.status) }}
      </strong>

      <div v-if="status.installation.previous_release_id">
        {{ t('nodeUpdatePrevious') }}:
        {{ status.installation.previous_release_id }}
      </div>

      <div v-if="status.installation.error_code">
        {{ t('nodeUpdateErrorCode') }}:
        {{ status.installation.error_code }}
      </div>
    </div>

    <div
      v-if="canInstall"
      class="install-confirmation"
    >
      <label>
        <input
          v-model="confirmed"
          type="checkbox"
          :disabled="disabled || actionBusy"
        />

        {{ t('nodeUpdateConfirm') }}
      </label>
    </div>

    <div class="actions">

      <button
        v-if="!operationId"
        type="button"
        :disabled="
          disabled ||
          actionBusy ||
          checkingForUpdate
        "
        @click="refreshUpdateCheck"
      >
        {{
          checkingForUpdate
            ? t('nodeUpdateChecking')
            : t('nodeUpdateCheck')
        }}
      </button>

      <button
        v-if="canPrepare"
        type="button"
        :disabled="disabled || actionBusy"
        @click="prepare"
      >
        {{
          actionBusy
            ? t('nodeUpdateWorking')
            : t('nodeUpdatePrepare')
        }}
      </button>

      <button
        v-if="canInstall"
        type="button"
        class="install-button"
        :disabled="
          disabled ||
          actionBusy ||
          !confirmed
        "
        @click="install"
      >
        {{
          actionBusy
            ? t('nodeUpdateWorking')
            : t('nodeUpdateInstall')
        }}
      </button>

      <button
        v-if="operationId"
        type="button"
        :disabled="actionBusy"
        @click="refreshStatus"
      >
        {{ t('checkStatus') }}
      </button>
    </div>

    <p
      v-if="operationPending"
      class="pending-message"
      role="status"
    >
      {{ t('nodeUpdateDoNotRetry') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'

import {
  FleetHttpError,
  useFleetApi,
  useFleetText,
} from './fleet-ui'

interface NodeUpdateOperation {
  operation_id: string
  device_id: string
  release_id: string
  archive_sha256: string
  status:
    | 'accepted'
    | 'running'
    | 'succeeded'
    | 'rolled_back'
    | 'failed'
    | 'unknown'
  updated_at: string
  previous_release_id: string | null
  error_code: string | null
}

interface PrepareResponse {
  prepared: {
    operation_id: string
    device_id: string
    release_id: string
    archive_sha256: string
    archive_size_bytes: number
    prepared_at: string
    expires_at: string
  }
  version: string
  channel: string
  command_id: string
  command_status: string
}

interface StatusResponse {
  operation_id: string
  device_id: string
  release_id: string
  archive_sha256: string
  archive_size_bytes: number

  state:
    | 'queued'
    | 'preparing'
    | 'prepared'
    | 'failed'
    | 'expired'

  command_id: string
  command_status: string

  hub_prepared_at: string
  hub_expires_at: string

  agent_prepared_at: string | null
  error: string | null

  apply_command_id: string | null
  apply_command_status: string | null

  installation: NodeUpdateOperation | null
}

interface ApplyResponse {
  operation_id: string
  command_id: string
  command_status: string
  expires_at: string
  installation: NodeUpdateOperation | null
}

interface NodeUpdateCheckResponse {
  current_release_id: string | null
  latest_release_id: string
  latest_version: string
  channel: string
  update_available: boolean | null
}

interface CommandHistoryItem {
  command_id: string
  command_type: string
  idempotency_key: string
}

interface PrepareIntent {
  knownCommandIds: string[]
}

const props = withDefaults(
  defineProps<{
    deviceId: string
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  (event: 'pending-change', value: boolean): void
  (event: 'completed'): void
}>()

const { requestJson } = useFleetApi()
const { t } = useFleetText()

const status = ref<StatusResponse | null>(null)
const operationId = ref('')
const confirmed = ref(false)
const actionBusy = ref(false)
const error = ref('')
const applyUncertain = ref(false)
const prepareIntent = ref<PrepareIntent | null>(null)
const prepareUncertain = ref(false)
const updateCheck = ref<NodeUpdateCheckResponse | null>(null)
const checkingForUpdate = ref(false)

let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false

const storageKey = computed(
  () => `fleet:node-update:${props.deviceId}`,
)

const prepareIntentKey = computed(
  () => `fleet:node-update-prepare:${props.deviceId}`,
)

const installationStatus = computed(
  () => status.value?.installation?.status || null,
)

const finalOutcome = computed(() =>
  ['succeeded', 'rolled_back', 'failed'].includes(
    installationStatus.value || '',
  ),
)

const updateAvailable = computed(
  () => updateCheck.value?.update_available === true,
)

const idleStatusText = computed(() => {
  if (checkingForUpdate.value) {
    return t('nodeUpdateChecking')
  }

  if (!updateCheck.value) {
    return ''
  }

  if (updateCheck.value.update_available === null) {
    return t('nodeUpdateCurrentUnknown')
  }

  return updateCheck.value.update_available
    ? t('nodeUpdateAvailable')
    : t('nodeUpdateUpToDate')
})

const idleStatusClass = computed(() => {
  if (checkingForUpdate.value) {
    return 'preparing'
  }

  if (updateCheck.value?.update_available === null) {
    return 'unknown'
  }

  return updateAvailable.value
    ? 'available'
    : 'succeeded'
})

const operationPending = computed(() => {
  if (prepareUncertain.value) return true
  if (applyUncertain.value) return true

  if (
    operationId.value &&
    !status.value
  ) {
    return true
  }

  if (!status.value) return actionBusy.value

  if (
    status.value.state === 'queued' ||
    status.value.state === 'preparing'
  ) {
    return true
  }

  if (!status.value.apply_command_id) {
    return false
  }

  if (!status.value.installation) {
    return !['failed', 'expired'].includes(
      status.value.apply_command_status || '',
    )
  }

  return ['accepted', 'running', 'unknown'].includes(
    status.value.installation.status,
  )
})

const canInstall = computed(
  () =>
    !applyUncertain.value &&
    status.value?.state === 'prepared' &&
    !status.value.apply_command_id &&
    !status.value.installation,
)

const canPrepare = computed(() => {
  if (prepareUncertain.value) return false
  if (!updateCheck.value) return false

  if (updateCheck.value.update_available === false) {
    return false
  }

  if (!status.value) return true

  if (
    status.value.state === 'failed' ||
    status.value.state === 'expired'
  ) {
    return true
  }

  if (
    status.value.apply_command_id &&
    ['failed', 'expired'].includes(
      status.value.apply_command_status || '',
    )
  ) {
    return true
  }

  return finalOutcome.value
})

const statusText = computed(() => {
  const installation = status.value?.installation

  if (installation) {
    return installationText(installation.status)
  }

  if (status.value?.apply_command_id) {
    if (status.value.apply_command_status === 'failed') {
      return t('nodeUpdateApplyFailed')
    }

    if (status.value.apply_command_status === 'expired') {
      return t('nodeUpdateApplyExpired')
    }

    return t('nodeUpdateInstalling')
  }

  if (!status.value) return ''

  if (status.value.state === 'queued') {
    return t('nodeUpdateQueued')
  }

  if (status.value.state === 'preparing') {
    return t('nodeUpdatePreparing')
  }

  if (status.value.state === 'prepared') {
    return t('nodeUpdatePrepared')
  }

  if (status.value.state === 'failed') {
    return t('nodeUpdateFailed')
  }

  return t('nodeUpdateExpired')
})

const statusClass = computed(() => {
  const installation = installationStatus.value

  if (installation) return installation

  if (
    status.value?.apply_command_status === 'failed'
  ) {
    return 'failed'
  }

  if (
    status.value?.apply_command_status === 'expired'
  ) {
    return 'expired'
  }

  return status.value?.state || ''
})

function installationText(
  value: NodeUpdateOperation['status'],
): string {
  const labels: Record<
    NodeUpdateOperation['status'],
    string
  > = {
    accepted: t('nodeUpdateAccepted'),
    running: t('nodeUpdateRunning'),
    succeeded: t('nodeUpdateSucceeded'),
    rolled_back: t('nodeUpdateRolledBack'),
    failed: t('nodeUpdateFailed'),
    unknown: t('nodeUpdateUnknown'),
  }

  return labels[value]
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '—'

  if (value >= 1024 ** 2) {
    return `${(value / (1024 ** 2)).toFixed(1)} MB`
  }

  return `${Math.round(value / 1024)} KB`
}

function saveOperation(value: string) {
  operationId.value = value

  try {
    localStorage.setItem(storageKey.value, value)
  } catch {
    // Browser persistence is optional.
  }
}

function clearOperation() {
  operationId.value = ''
  status.value = null
  confirmed.value = false

  try {
    localStorage.removeItem(storageKey.value)
  } catch {
    // Browser persistence is optional.
  }
}

function errorMessage(reason: unknown): string {
  if (reason instanceof FleetHttpError) {
    if (reason.status === 409) {
      return t('nodeUpdateBlocked')
    }

    if (reason.status === 404) {
      return t('nodeUpdateMissing')
    }
  }

  return t('nodeUpdateRequestFailed')
}

function savePrepareIntent(value: PrepareIntent | null) {
  prepareIntent.value = value
  prepareUncertain.value = value !== null

  if (value) {
    localStorage.setItem(
      prepareIntentKey.value,
      JSON.stringify(value),
    )
  } else {
    localStorage.removeItem(prepareIntentKey.value)
  }
}

async function refreshUpdateCheck() {
  if (
    checkingForUpdate.value ||
    disposed
  ) {
    return
  }

  checkingForUpdate.value = true

  try {
    const result = await requestJson<NodeUpdateCheckResponse>(
      `/api/v1/devices/${encodeURIComponent(props.deviceId)}` +
        '/node-updates/check?channel=beta',
    )

    if (!disposed) {
      updateCheck.value = result
    }
  } catch {
    if (!disposed) {
      updateCheck.value = null
    }
  } finally {
    if (!disposed) {
      checkingForUpdate.value = false
    }
  }
}

async function recoverPrepare() {
  const intent = prepareIntent.value

  if (
    !intent ||
    operationId.value ||
    disposed
  ) {
    return
  }

  try {
    const history = await requestJson<{
      items: CommandHistoryItem[]
    }>(
      `/api/v1/devices/${encodeURIComponent(props.deviceId)}` +
        '/commands?limit=200',
    )

    if (disposed || prepareIntent.value !== intent) {
      return
    }

    const known = new Set(intent.knownCommandIds)

    const candidates = history.items.filter(
      command =>
        command.command_type === 'agent.update.prepare' &&
        !known.has(command.command_id) &&
        command.idempotency_key.startsWith(
          'node-update-prepare:',
        ),
    )

    if (candidates.length !== 1) {
      return
    }

    const operationIdCandidate =
      candidates[0].idempotency_key.slice(
        'node-update-prepare:'.length,
      )

    if (
      !/^nodeupd_[0-9a-f]{32}$/.test(
        operationIdCandidate,
      )
    ) {
      return
    }

    saveOperation(operationIdCandidate)
    savePrepareIntent(null)

    await refreshStatus()
  } catch {
    // Keep the uncertain intent locked and try again later.
  }
}

async function prepare() {
  if (
    props.disabled ||
    actionBusy.value ||
    prepareUncertain.value ||
    disposed
  ) {
    return
  }

  if (finalOutcome.value) {
    clearOperation()
  }

  actionBusy.value = true
  error.value = ''
  confirmed.value = false

  let postStarted = false

  try {
    const history = await requestJson<{
      items: CommandHistoryItem[]
    }>(
      `/api/v1/devices/${encodeURIComponent(props.deviceId)}` +
        '/commands?limit=200',
    )

    if (disposed) return

    savePrepareIntent({
      knownCommandIds: history.items
        .filter(
          command =>
            command.command_type ===
            'agent.update.prepare',
        )
        .map(command => command.command_id),
    })

    postStarted = true

    const result = await requestJson<PrepareResponse>(
      `/api/v1/devices/${encodeURIComponent(props.deviceId)}` +
        '/node-updates/prepare',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'beta',
        }),
      },
    )

    if (disposed) return

    saveOperation(result.prepared.operation_id)
    savePrepareIntent(null)

    await refreshStatus()
  } catch (reason) {
    if (!disposed) {
      if (
        postStarted &&
        reason instanceof FleetHttpError &&
        reason.status >= 400 &&
        reason.status < 500
      ) {
        savePrepareIntent(null)
      }

      error.value = errorMessage(reason)

      if (
        postStarted &&
        prepareUncertain.value
      ) {
        await recoverPrepare()
      }
    }
  } finally {
    if (!disposed) {
      actionBusy.value = false
    }
  }
}

async function install() {
  if (
    !canInstall.value ||
    !confirmed.value ||
    props.disabled ||
    actionBusy.value ||
    disposed
  ) {
    return
  }

  applyUncertain.value = true
  actionBusy.value = true
  error.value = ''

  try {
    await requestJson<ApplyResponse>(
      `/api/v1/devices/${encodeURIComponent(props.deviceId)}` +
        `/node-updates/${encodeURIComponent(operationId.value)}/apply`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmed_install: true,
        }),
      },
    )

    if (!disposed) {
      confirmed.value = false
      await refreshStatus()
    }
  } catch (reason) {
    if (!disposed) {
      if (
        reason instanceof FleetHttpError &&
        reason.status >= 400 &&
        reason.status < 500
      ) {
        applyUncertain.value = false
      }

      error.value = errorMessage(reason)
    }
  } finally {
    if (!disposed) {
      actionBusy.value = false
    }
  }
}

async function refreshStatus() {
  if (
    !operationId.value ||
    disposed
  ) {
    return
  }

  try {
    const result = await requestJson<StatusResponse>(
      `/api/v1/devices/${encodeURIComponent(props.deviceId)}` +
        `/node-updates/${encodeURIComponent(operationId.value)}`,
    )

    if (disposed) return

    status.value = result
    applyUncertain.value = false
    error.value = ''

    if (
      result.installation?.status === 'succeeded'
    ) {
      clearOperation()
      await refreshUpdateCheck()
      emit('completed')
    }
  } catch (reason) {
    if (!disposed) {
      error.value = errorMessage(reason)
    }
  }
}

function schedulePoll() {
  if (disposed) return

  timer = setTimeout(async () => {
    if (!document.hidden) {
      if (prepareUncertain.value) {
        await recoverPrepare()
      }

      if (operationId.value) {
        await refreshStatus()
      }
    }

    schedulePoll()
  }, operationPending.value ? 2000 : 10000)
}

watch(
  operationPending,
  value => emit('pending-change', value),
  {
    immediate: true,
  },
)

onMounted(() => {
  try {
    const stored =
      localStorage.getItem(storageKey.value)

    if (stored) {
      operationId.value = stored
    }
  } catch {
    // Browser persistence is optional.
  }

  try {
    const storedIntent =
      localStorage.getItem(prepareIntentKey.value)

    if (storedIntent && !operationId.value) {
      const value = JSON.parse(storedIntent)

      if (
        !Array.isArray(value.knownCommandIds) ||
        !value.knownCommandIds.every(
          (item: unknown) =>
            typeof item === 'string',
        )
      ) {
        throw new Error('Invalid prepare intent')
      }

      prepareIntent.value = {
        knownCommandIds: value.knownCommandIds,
      }

      prepareUncertain.value = true
    } else if (operationId.value) {
      localStorage.removeItem(
        prepareIntentKey.value,
      )
    }
  } catch {
    if (!operationId.value) {
      prepareUncertain.value = true
    }
  }
  void refreshUpdateCheck()
  if (prepareUncertain.value) {
    void recoverPrepare()
  }

  if (operationId.value) {
    void refreshStatus()
  }

  schedulePoll()
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
.node-update-panel {
  border: 1px solid var(--surface-border, #48515e);
  border-radius: 12px;
  background: var(--surface-1, transparent);
  padding: 1.25rem;
}

.section-header,
.actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.section-header {
  justify-content: space-between;
}

.section-header h2 {
  margin: 0;
}

.section-header p {
  margin: .35rem 0 0;
  color: var(--text-secondary, #9ca3af);
}

.update-status {
  border-radius: 999px;
  padding: .35rem .7rem;
  font-size: .8rem;
  font-weight: 600;
  white-space: nowrap;
}

.update-status.prepared,
.update-status.succeeded {
  color: #22c55e;
}

.update-status.queued,
.update-status.preparing,
.update-status.accepted,
.update-status.running,
.update-status.available {
  color: #f59e0b;
}

.update-status.failed,
.update-status.rolled_back,
.update-status.unknown,
.update-status.expired {
  color: var(--error-color, #ef4444);
}

.update-info {
  margin-top: 1rem;
  display: grid;
  gap: .7rem;
}

.update-info > div {
  display: grid;
  grid-template-columns: minmax(10rem, .5fr) 1fr;
  gap: .75rem;
}

.update-info span {
  color: var(--text-secondary, #9ca3af);
}

.installation-result {
  margin-top: 1rem;
  padding: .8rem;
  border: 1px solid currentColor;
  border-radius: 8px;
}

.installation-result.succeeded {
  color: #22c55e;
}

.installation-result.running,
.installation-result.accepted {
  color: #f59e0b;
}

.installation-result.failed,
.installation-result.rolled_back,
.installation-result.unknown {
  color: var(--error-color, #ef4444);
}

.install-confirmation,
.pending-message {
  margin-top: 1rem;
}

.actions {
  margin-top: 1rem;
  flex-wrap: wrap;
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

.install-button {
  background: var(--primary-color, #3b82f6);
  border-color: var(--primary-color, #3b82f6);
  color: white;
}

button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.error {
  color: var(--error-color, #ef4444);
}

.pending-message {
  color: var(--text-secondary, #9ca3af);
}

code {
  overflow-wrap: anywhere;
}

@media (max-width: 700px) {
  .section-header {
    align-items: stretch;
    flex-direction: column;
  }

  .update-info > div {
    grid-template-columns: 1fr;
    gap: .2rem;
  }

  .actions button {
    flex: 1;
  }
}
</style>
