import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DeviceDetail from '../frontend/src/DeviceDetail.vue'
import FleetApp from '../frontend/src/FleetApp.vue'
import CapabilityControl from '../frontend/src/CapabilityControl.vue'
import GpioConfiguration from '../frontend/src/GpioConfiguration.vue'
import NodeUpdateControl from '../frontend/src/NodeUpdateControl.vue'

let wrapper: ReturnType<typeof mount> | undefined
let moduleStatus = 'succeeded'
let commandStatus = ''
let moduleKey = ''
const device = () => ({ device_id: 'dev_test', display_name: 'Zero', online: true, revoked_at: null,
  role: 'node', protocol_version: '1.0', last_seen_at: null, approved_at: null, latest_inventory: null,
  modules: [{ module_id: 'org.test', installed_version: '1.0.0', desired_version: '1.0.0',
    enabled: true, status: moduleStatus, error: null }] })
const response = (data: unknown, status = 200) => Promise.resolve({ ok: status === 200, status,
  text: async () => JSON.stringify(data) })
let failCapabilities = false
let postLost = false
function transport(url: string, options: RequestInit = {}) {
  if (options.method === 'POST') {
    moduleKey = new Headers(options.headers).get('Idempotency-Key') || ''
    moduleStatus = 'queued'; commandStatus = 'queued'
    return postLost ? Promise.reject(new TypeError('Lost response')) : response({ command_id: 'cmd_test', status: 'queued' })
  }
  if (url.includes('/capabilities')) return response([], failCapabilities ? 500 : 200)
  if (url.includes('/commands')) return response({ items: commandStatus ? [{ command_id: 'cmd_test', status: commandStatus,
    command_type: 'module.disable', idempotency_key: `module.client:scoped:${moduleKey}`, created_at: null }] : [], total: 0 })
  if (url.includes('/packages')) return response([])
  if (url.includes('/pairing')) return response([])
  if (url.endsWith('/devices')) return response({ items: [{ ...device(), revoked_at: '2026-09-30' }] })
  return response(device())
}
beforeEach(() => {
  vi.useFakeTimers()
  moduleStatus = 'succeeded'; commandStatus = ''; failCapabilities = false; postLost = false
  localStorage.setItem('mm_backend_url_override', window.location.origin)
  localStorage.setItem('preferredLanguage', 'en')
  window.history.replaceState({}, '', '/fleet/device?id=dev_test')
  vi.stubGlobal('fetch', vi.fn(transport))
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear() })

it('keeps device and command history visible when capabilities fail', async () => {
  failCapabilities = true; commandStatus = 'succeeded'
  wrapper = mount(DeviceDetail); await flushPromises()
  expect(wrapper.text()).toContain('Zero')
  expect(wrapper.text()).toContain('cmd_test')
  expect(wrapper.text()).toContain('Could not refresh this section')
})

it('does not confirm a queued module request; waits for the command result', async () => {
  wrapper = mount(DeviceDetail); await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === 'Disable')!.trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Waiting for device confirmation')
  expect(wrapper.findAll('button').find(button => button.text() === 'Disable')!.attributes('disabled')).toBeDefined()
  moduleStatus = 'succeeded'; commandStatus = 'succeeded'
  await vi.advanceTimersByTimeAsync(10000); await flushPromises()
  expect(wrapper.text()).not.toContain('Waiting for device confirmation')
})

it('recovers a lost POST reply from the matching Core command without resending', async () => {
  postLost = true
  wrapper = mount(DeviceDetail); await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === 'Disable')!.trigger('click')
  await flushPromises()
  moduleStatus = 'succeeded'; commandStatus = 'succeeded'
  await vi.advanceTimersByTimeAsync(10000); await flushPromises()
  expect(wrapper.text()).not.toContain('do not repeat it yet')
  expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
})

it('shows revoked and switches the visible text with the host language event', async () => {
  wrapper = mount(FleetApp); await flushPromises()
  expect(wrapper.text()).toContain('Access revoked')
  localStorage.setItem('preferredLanguage', 'bg')
  window.dispatchEvent(new CustomEvent('language-changed'))
  await flushPromises()
  expect(wrapper.text()).toContain('Отнет достъп')
  expect(wrapper.text()).toContain('Нови устройства')
})

it('aborts hung requests at the deadline and on unmount', async () => {
  const signals: AbortSignal[] = []
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
    signals.push(options.signal)
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })))
  wrapper = mount(FleetApp); await flushPromises()
  await vi.advanceTimersByTimeAsync(10000); await flushPromises()
  expect(signals.every(signal => signal.aborted)).toBe(true)
  await wrapper.findAll('button')[0].trigger('click'); await flushPromises()
  const latest = signals.slice(-2)
  wrapper.unmount(); wrapper = undefined
  expect(latest.every(signal => signal.aborted)).toBe(true)
})

function capabilityTransport({ lost = false, stale = false, missing = false } = {}) {
  let queued: Record<string, any> | undefined
  let status = 'queued'
  let value = false
  const fetcher = vi.fn((url: string, options: RequestInit = {}) => {
    if (options.method === 'POST') {
      queued = JSON.parse(options.body as string)
      return lost ? Promise.reject(new TypeError('Lost reply')) : response({ command_id: 'cmd_gpio', status })
    }
    if (url.includes('/commands')) return response({ items: queued
      ? [{ command_id: 'cmd_gpio', idempotency_key: queued.idempotency_key, status }] : [] })
    return response({ values: { 'gpio.output.1': value },
      observed_at: new Date(Date.now() - (stale ? 120000 : 0)).toISOString() }, missing ? 404 : 200)
  })
  vi.stubGlobal('fetch', fetcher)
  return { fetcher, queued: () => queued, finish: (next: string) => { status = next; value = next === 'succeeded' } }
}
const controlProps = { deviceId: 'dev_test', capabilityId: 'generic.digital.control', disabled: false,
  metadata: { automation_channels: 'gpio.output.1', automation_actions: 'set_output,pulse_output' } }
const controlButton = (text: string) => wrapper!.findAll('button').find(button => button.text() === text)!

it('requires confirmation, uses a five-second unique command, and never shows optimistic GPIO state', async () => {
  const transport = capabilityTransport()
  wrapper = mount(CapabilityControl, { props: controlProps }); await flushPromises()
  expect(controlButton('Switch on').attributes('disabled')).toBeDefined()
  await wrapper.find('input[type="checkbox"]').setValue(true)
  await controlButton('Switch on').trigger('click'); await flushPromises()
  expect(transport.queued()).toMatchObject({ command_type: 'capability.invoke', ttl_seconds: 5,
    payload: { capability_id: 'generic.digital.control', action: 'set_output', arguments: { channel: 'gpio.output.1', value: true } } })
  expect(transport.queued()!.idempotency_key).toMatch(/^fleet:[0-9a-f]{32}$/)
  expect(wrapper.find('dd').text()).toBe('Off / inactive')
  expect(controlButton('Switch off').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('Waiting for device confirmation')
  transport.finish('succeeded')
  await vi.advanceTimersByTimeAsync(10000); await flushPromises()
  expect(wrapper.text()).toContain('Confirmed by device')
  expect(wrapper.find('dd').text()).toBe('On / active')
})

it('retains unknown GPIO intent across reload without replay and requires explicit review to unlock', async () => {
  const transport = capabilityTransport({ lost: true })
  wrapper = mount(CapabilityControl, { props: controlProps }); await flushPromises()
  await wrapper.find('input[type="checkbox"]').setValue(true)
  await controlButton('Pulse').trigger('click'); await flushPromises()
  transport.finish('unknown')
  wrapper.unmount()
  wrapper = mount(CapabilityControl, { props: controlProps }); await flushPromises()
  expect(wrapper.text()).toContain('do not repeat it yet')
  expect(controlButton('Pulse').attributes('disabled')).toBeDefined()
  expect(transport.fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  await wrapper.find('input[type="checkbox"]').setValue(true)
  await controlButton('I inspected the actual outcome — unlock test controls').trigger('click')
  expect(controlButton('Pulse').attributes('disabled')).toBeUndefined()
  expect(transport.fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
})

it.each(['stale', 'missing', 'offline'])('blocks GPIO when %s instead of assuming a false value', async (condition) => {
  capabilityTransport({ stale: condition === 'stale', missing: condition === 'missing' })
  wrapper = mount(CapabilityControl, { props: { ...controlProps, disabled: condition === 'offline' } }); await flushPromises()
  await wrapper.find('input[type="checkbox"]').setValue(true)
  expect(controlButton('Switch on').attributes('disabled')).toBeDefined()
  if (condition === 'missing') expect(wrapper.find('dd').exists()).toBe(false)
  if (condition === 'stale') expect(wrapper.text()).toContain('Values are stale')
})

it('validates pulse duration before queuing', async () => {
  const transport = capabilityTransport()
  wrapper = mount(CapabilityControl, { props: controlProps }); await flushPromises()
  await wrapper.find('input[type="checkbox"]').setValue(true)
  await wrapper.find('input[type="number"]').setValue('0')
  expect(controlButton('Pulse').attributes('disabled')).toBeDefined()
  expect(transport.queued()).toBeUndefined()
})

it('reports pending physical commands to its parent', async () => {
  const transport = capabilityTransport()

  wrapper = mount(CapabilityControl, {
    props: controlProps,
  })

  await flushPromises()

  await wrapper.find('input[type="checkbox"]').setValue(true)
  await controlButton('Switch on').trigger('click')
  await flushPromises()

  expect(
    wrapper.emitted('pending-change')?.some(
      event => event[0] === true,
    ),
  ).toBe(true)

  transport.finish('succeeded')

  await vi.advanceTimersByTimeAsync(10000)
  await flushPromises()

  expect(
    wrapper.emitted('pending-change')?.some(
      event => event[0] === false,
    ),
  ).toBe(true)
})

function gpioConfigurationTransport(blocking = false) {
  let queued: Record<string, any> | undefined
  let status = 'queued'
  const report = { schema_version: 1, revision: 'a'.repeat(64), driver: 'mock', outputs: { 'gpio.output.1': 17 },
    configurable: true, native_supported: true, allowed_pins: [{ bcm_pin: 17, physical_pin: 11 }],
    blocking_modules: blocking ? ['org.generic.output'] : [], error: null }
  const fetcher = vi.fn((url: string, options: RequestInit = {}) => {
    if (options.method === 'POST') { queued = JSON.parse(options.body as string); return response({ command_id: 'cmd_config', status }) }
    if (url.includes('/commands')) return response({ items: queued ? [{ command_id: 'cmd_config', idempotency_key: queued.idempotency_key, status }] : [] })
    return response({ reported_state: { gpio_configuration: report }, reported_at: new Date().toISOString() })
  })
  vi.stubGlobal('fetch', fetcher)
  return { fetcher, queued: () => queued, finish: () => { status = 'succeeded'; report.driver = 'gpiod' } }
}
it('shows BCM and physical pins, requires confirmation, and waits for device configuration', async () => {
  const transport = gpioConfigurationTransport()
  wrapper = mount(GpioConfiguration, { props: { deviceId: 'dev_test', disabled: false } }); await flushPromises()
  expect(wrapper.text()).toContain('GPIO 17 — physical pin 11')
  expect(controlButton('Apply output configuration').attributes('disabled')).toBeDefined()
  await wrapper.findAll('select')[0].setValue('gpiod')
  await wrapper.find('input[type="checkbox"]').setValue(true)
  await controlButton('Apply output configuration').trigger('click'); await flushPromises()
  expect(transport.queued()).toMatchObject({ command_type: 'agent.gpio.configure', ttl_seconds: 10,
    payload: { expected_revision: 'a'.repeat(64), confirmed_safe: true, configuration: { driver: 'gpiod', bcm_pin: 17 } } })
  expect(wrapper.text()).toContain('Waiting for device confirmation')
  expect(wrapper.find('.current').text()).toContain('mock')
  transport.finish(); await vi.advanceTimersByTimeAsync(2000); await flushPromises()
  expect(wrapper.find('.current').text()).toContain('gpiod')
  expect(wrapper.text()).toContain('Confirmed by device')
  expect(transport.fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
})
it('refuses pin changes while any GPIO module is enabled', async () => {
  const transport = gpioConfigurationTransport(true)
  wrapper = mount(GpioConfiguration, { props: { deviceId: 'dev_test', disabled: false } }); await flushPromises()
  await wrapper.find('input[type="checkbox"]').setValue(true)
  expect(controlButton('Apply output configuration').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('org.generic.output')
  expect(transport.queued()).toBeUndefined()
})


const otaOperationId = `nodeupd_${'a'.repeat(32)}`
const otaReleaseId = 'v0.3.0-beta.26'
const otaSha = 'b'.repeat(64)

function otaResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  })
}

function otaStatus(overrides: Record<string, unknown> = {}) {
  return {
    operation_id: otaOperationId,
    device_id: 'dev_test',
    release_id: otaReleaseId,
    archive_sha256: otaSha,
    archive_size_bytes: 1024 * 1024,
    state: 'prepared',
    command_id: 'cmd_prepare',
    command_status: 'succeeded',
    hub_prepared_at: new Date().toISOString(),
    hub_expires_at: new Date(Date.now() + 600000).toISOString(),
    agent_prepared_at: new Date().toISOString(),
    error: null,
    apply_command_id: null,
    apply_command_status: null,
    installation: null,
    ...overrides,
  }
}

it('prepares, requires explicit confirmation, installs, and waits for final succeeded outcome', async () => {
  let prepared = false
  let applied = false

  const fetcher = vi.fn(
    (url: string, options: RequestInit = {}) => {
      if (
        options.method === 'POST' &&
        url.endsWith('/node-updates/prepare')
      ) {
        prepared = true

        return otaResponse(
          {
            prepared: {
              operation_id: otaOperationId,
              device_id: 'dev_test',
              release_id: otaReleaseId,
              archive_sha256: otaSha,
              archive_size_bytes: 1024 * 1024,
              prepared_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 600000).toISOString(),
            },
            version: '0.3.0-beta.26',
            channel: 'beta',
            command_id: 'cmd_prepare',
            command_status: 'queued',
          },
          202,
        )
      }

	  if (url.includes('/commands?limit=200')) {
	    return otaResponse({
		  items: [],
	    })
	  }

      if (
        options.method === 'POST' &&
        url.endsWith(`/${otaOperationId}/apply`)
      ) {
        applied = true

        expect(JSON.parse(options.body as string)).toEqual({
          confirmed_install: true,
        })

        return otaResponse(
          {
            operation_id: otaOperationId,
            command_id: 'cmd_apply',
            command_status: 'queued',
            expires_at: new Date(Date.now() + 120000).toISOString(),
            installation: null,
          },
          202,
        )
      }

      if (
        url.endsWith(
          `/devices/dev_test/node-updates/${otaOperationId}`,
        )
      ) {
        expect(prepared).toBe(true)

        return otaResponse(
          otaStatus(
            applied
              ? {
                  apply_command_id: 'cmd_apply',
                  apply_command_status: 'succeeded',
                  installation: {
                    operation_id: otaOperationId,
                    device_id: 'dev_test',
                    release_id: otaReleaseId,
                    archive_sha256: otaSha,
                    status: 'succeeded',
                    updated_at: new Date().toISOString(),
                    previous_release_id: 'v0.3.0-beta.25',
                    error_code: null,
                  },
                }
              : {},
          ),
        )
      }

      return otaResponse({}, 404)
    },
  )

  vi.stubGlobal('fetch', fetcher)

  wrapper = mount(NodeUpdateControl, {
    props: {
      deviceId: 'dev_test',
      disabled: false,
    },
  })

  await flushPromises()

  await controlButton('Prepare update').trigger('click')
  await flushPromises()

  expect(wrapper.text()).toContain('Ready to install')

  const installButton = controlButton('Install')
  expect(installButton.attributes('disabled')).toBeDefined()

  await wrapper.find('input[type="checkbox"]').setValue(true)

  expect(installButton.attributes('disabled')).toBeUndefined()

  await installButton.trigger('click')
  await flushPromises()

  expect(wrapper.text()).toContain(
    'Update completed successfully',
  )

  expect(
    fetcher.mock.calls.filter(
      ([, options]) => options?.method === 'POST',
    ),
  ).toHaveLength(2)
})

it('recovers a lost install reply after reload without sending install again', async () => {
  let applied = false
  let installationStatus: 'running' | 'succeeded' = 'running'
  let applyPosts = 0

  const fetcher = vi.fn(
    (url: string, options: RequestInit = {}) => {
      if (url.includes('/commands?limit=200')) {
        return otaResponse({
          items: [],
        })
      }

      if (
        options.method === 'POST' &&
        url.endsWith('/node-updates/prepare')
      ) {
        return otaResponse(
          {
            prepared: {
              operation_id: otaOperationId,
              device_id: 'dev_test',
              release_id: otaReleaseId,
              archive_sha256: otaSha,
              archive_size_bytes: 1024 * 1024,
              prepared_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 600000).toISOString(),
            },
            version: '0.3.0-beta.26',
            channel: 'beta',
            command_id: 'cmd_prepare',
            command_status: 'queued',
          },
          202,
        )
      }

      if (
        options.method === 'POST' &&
        url.endsWith(`/${otaOperationId}/apply`)
      ) {
        applyPosts += 1
        applied = true

        return Promise.reject(
          new TypeError('Lost install response'),
        )
      }

      if (
        url.endsWith(
          `/devices/dev_test/node-updates/${otaOperationId}`,
        )
      ) {
        return otaResponse(
          otaStatus(
            applied
              ? {
                  apply_command_id: 'cmd_apply',
                  apply_command_status: 'delivered',
                  installation: {
                    operation_id: otaOperationId,
                    device_id: 'dev_test',
                    release_id: otaReleaseId,
                    archive_sha256: otaSha,
                    status: installationStatus,
                    updated_at: new Date().toISOString(),
                    previous_release_id: 'v0.3.0-beta.25',
                    error_code: null,
                  },
                }
              : {},
          ),
        )
      }

      return otaResponse({}, 404)
    },
  )

  vi.stubGlobal('fetch', fetcher)

  wrapper = mount(NodeUpdateControl, {
    props: {
      deviceId: 'dev_test',
      disabled: false,
    },
  })

  await flushPromises()

  await controlButton('Prepare update').trigger('click')
  await flushPromises()

  await wrapper.find('input[type="checkbox"]').setValue(true)
  await controlButton('Install').trigger('click')
  await flushPromises()

  expect(applyPosts).toBe(1)

  wrapper.unmount()

  wrapper = mount(NodeUpdateControl, {
    props: {
      deviceId: 'dev_test',
      disabled: false,
    },
  })

  await flushPromises()

  expect(wrapper.text()).toContain('Installing')

  installationStatus = 'succeeded'

  await vi.advanceTimersByTimeAsync(10000)
  await flushPromises()

  expect(wrapper.text()).toContain(
    'Update completed successfully',
  )

  expect(applyPosts).toBe(1)
})

it('recovers a lost prepare reply without sending prepare again', async () => {
  let preparePosted = false
  let preparePosts = 0

  const fetcher = vi.fn(
    (url: string, options: RequestInit = {}) => {
      if (url.includes('/commands?limit=200')) {
        return otaResponse({
          items: preparePosted
            ? [
                {
                  command_id: 'cmd_prepare_recovered',
                  command_type: 'agent.update.prepare',
                  idempotency_key:
                    `node-update-prepare:${otaOperationId}`,
                },
              ]
            : [],
        })
      }

      if (
        options.method === 'POST' &&
        url.endsWith('/node-updates/prepare')
      ) {
        preparePosts += 1
        preparePosted = true

        return Promise.reject(
          new TypeError('Lost prepare response'),
        )
      }

      if (
        url.endsWith(
          `/devices/dev_test/node-updates/${otaOperationId}`,
        )
      ) {
        return otaResponse(
          otaStatus({
            command_id: 'cmd_prepare_recovered',
            command_status: 'succeeded',
            state: 'prepared',
          }),
        )
      }

      return otaResponse({}, 404)
    },
  )

  vi.stubGlobal('fetch', fetcher)

  wrapper = mount(NodeUpdateControl, {
    props: {
      deviceId: 'dev_test',
      disabled: false,
    },
  })

  await flushPromises()

  await controlButton('Prepare update').trigger('click')
  await flushPromises()

  expect(preparePosts).toBe(1)

  expect(wrapper.text()).toContain(
    'Ready to install',
  )

  expect(
    localStorage.getItem(
      'fleet:node-update:dev_test',
    ),
  ).toBe(otaOperationId)

  expect(
    localStorage.getItem(
      'fleet:node-update-prepare:dev_test',
    ),
  ).toBeNull()
})
