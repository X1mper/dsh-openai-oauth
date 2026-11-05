import type {} from '@deepseek-ai/dsh-client-locale/client'
import { Button, DisclosureRow, StateDot, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import { hasSettingsFields, isCodexCapSchema, selectSettingsId } from './context-settings-discovery.js'
import { CompactionSettings } from './compaction-settings.js'
import { ContextSettings } from './context-settings.js'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ContextPolicyConfig } from './context-policy.js'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { applyLimits } from './limits-client.js'
import { applyContextIndicator } from './context-indicator-client.js'

const ENDPOINT = '/api/codex-oauth'

interface Model {
  id: string
  name: string
}

interface Status {
  authenticated: boolean
  email?: string | null
  planType?: string | null
  models: Model[]
}

function pageCopy(language: string) {
const ru = language.startsWith('ru')
const zh = language.startsWith('zh')
return ru ? {
  title: 'OpenAI · Codex', intro: 'Аккаунт ChatGPT, компоненты и контекст диалогов.', connected: 'Подключён', disconnected: 'Не подключён', login: 'Войти через ChatGPT', waiting: 'Ожидание авторизации…', logout: 'Выйти', refresh: 'Обновить', models: 'Доступные модели', noModels: 'Модели появятся после входа.', popup: 'Продолжить вход в браузере',
} : zh ? {
  title: 'OpenAI · Codex',
  intro: '使用 ChatGPT 账户连接 GPT 模型。登录和 token 刷新完全由本机 Codex app-server 管理。',
  connected: '已连接',
  disconnected: '尚未连接',
  login: '使用 ChatGPT 登录',
  waiting: '等待浏览器授权…',
  logout: '退出登录',
  refresh: '刷新状态',
  models: '可用模型',
  noModels: '登录后将显示账户可用的模型。',
  popup: '如果登录页没有自动打开，请点击这里继续。',
} : {
  title: 'OpenAI · Codex',
  intro: 'Connect GPT models with your ChatGPT account. The local Codex app-server owns login and token refresh.',
  connected: 'Connected',
  disconnected: 'Not connected',
  login: 'Sign in with ChatGPT',
  waiting: 'Waiting for browser authorization…',
  logout: 'Sign out',
  refresh: 'Refresh status',
  models: 'Available models',
  noModels: 'Models available to your account appear after sign-in.',
  popup: 'If the sign-in page did not open, continue here.',
}

}

async function request<T>(path = '', method = 'GET'): Promise<T> {
  const response = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  })
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `HTTP ${String(response.status)}`)
  return body
}

const styles: Record<string, CSSProperties> = {
  section: { maxWidth: 720, padding: '4px 0 32px' },
  title: { fontSize: 20, margin: '0 0 8px' },
  intro: { color: 'var(--dsw-alias-label-secondary, currentColor)', lineHeight: 1.6, margin: '0 0 20px' },
  card: { border: '1px solid var(--dsw-alias-border-l2-darkmode-thin, #888)', borderRadius: 12, padding: 20 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  status: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 },
  meta: { color: 'var(--dsw-alias-label-secondary, currentColor)', fontSize: 13, marginTop: 6 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  error: { color: '#b42318', marginTop: 12 },
  models: { marginTop: 24 },
  list: { margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.8 },
}

export function OpenAiOAuthSection({ policy, contextControls, manageComponents, language = 'en' }: SettingsSectionOwnerProps & { contextControls?: ReactNode; language?: string; policy?: ConfigForm<ContextPolicyConfig>; manageComponents?: () => void }): ReactNode {
  const ru = language.startsWith('ru')
  const copy = pageCopy(language)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [status, setStatus] = useState<Status | undefined>()
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [authUrl, setAuthUrl] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  const refresh = useCallback(async (): Promise<Status | undefined> => {
    try {
      const next = await request<Status>()
      setStatus(next)
      setError(undefined)
      if (next.authenticated) {
        setWaiting(false)
        setAuthUrl(undefined)
      }
      return next
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return undefined
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => { void refresh() }, 1200)
    return () => { window.clearInterval(timer) }
  }, [refresh, waiting])

  const login = async (): Promise<void> => {
    const popup = window.open('about:blank', '_blank')
    if (popup !== null) popup.opener = null
    setBusy(true)
    setError(undefined)
    try {
      const result = await request<{ authUrl?: string }>('/login', 'POST')
      if (typeof result.authUrl !== 'string') throw new Error('Codex did not return an authentication URL.')
      setAuthUrl(result.authUrl)
      setWaiting(true)
      if (popup !== null) popup.location.href = result.authUrl
    } catch (reason) {
      popup?.close()
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const logout = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await request('/logout', 'POST')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const connected = status?.authenticated === true
  return (
    <section style={styles.section}>
      <h2 style={styles.title}>{copy.title}</h2>
      <p style={styles.intro}>{copy.intro}</p>
      <div style={styles.card}>
        <div style={styles.row}>
          <div>
            <div style={styles.status} role="status" aria-live="polite">
              <StateDot state={status === undefined ? 'ongoing' : connected ? 'done' : 'idle'} />
              {status === undefined ? (error ? (ru ? 'Не удалось получить статус' : 'Status unavailable') : (ru ? 'Подключение…' : 'Connecting…')) : connected ? copy.connected : copy.disconnected}
            </div>
            {connected
              ? <div style={styles.meta}>{[status.email, status.planType].filter(Boolean).join(' · ')}</div>
              : null}
          </div>
        </div>
        <div style={styles.actions}>
          {connected
            ? <Button variant="outline" type="button" disabled={busy} onClick={() => { void logout() }}>{copy.logout}</Button>
            : <Button variant="primary" type="button" disabled={busy || waiting} onClick={() => { void login() }}>{waiting ? copy.waiting : copy.login}</Button>}
          <Button variant="outline" type="button" disabled={busy} onClick={() => { void refresh() }}>{copy.refresh}</Button>
        </div>
        {authUrl === undefined ? null : <p><a href={authUrl} target="_blank" rel="noreferrer">{copy.popup}</a></p>}
        {error === undefined ? null : <p style={styles.error} role="alert">{error}</p>}
        <div style={styles.models}>
          <DisclosureRow icon={null} title={`${copy.models}${status?.models.length ? ` (${status.models.length})` : ''}`} open={modelsOpen} expandable onToggle={() => setModelsOpen(open => !open)} expandOnRowClick>
          {status?.models.length
            ? <ul style={styles.list}>{status.models.map(model => <li key={model.id}>{model.name} <code>{model.id}</code></li>)}</ul>
            : <p style={styles.meta}>{copy.noModels}</p>}
          </DisclosureRow>
        </div>
      </div>
      <div style={styles.models}>
        <h3>{ru ? 'Компоненты' : 'Components'}</h3>
        <p style={styles.intro}>{ru ? 'Провайдер, поиск, загрузка страниц, картинки и политика контекста включаются независимо в карточке плагина.' : 'Provider, search, page fetching, images and context policy can be enabled independently in the plugin card.'}</p>
        {manageComponents ? <Button variant="outline" onClick={manageComponents}>{ru ? 'Управлять компонентами' : 'Manage components'}</Button> : null}
      </div>
      <div style={styles.models}>
        <h3>{ru ? 'Контекст и старые сессии' : 'Context and older sessions'}</h3>
        <p style={styles.intro}>{ru ? 'Сжатие выполняет Harness: его плагины контекста продолжают управлять историей. Интервал простоя — наша политика, а не гарантированный срок кэша OpenAI.' : 'Harness performs compaction, so context plugins keep control of history. The idle interval is our policy, not a guaranteed OpenAI cache lifetime.'}</p>
        {contextControls}
        {policy ? <ContextSettings scope={policy} ru={ru} /> : null}
      </div>
    </section>
  )
}

export const inject = ['slots', 'locale', 'configForms']

export function apply(ctx: ClientContext): void {
  applyLimits(ctx)
  applyContextIndicator(ctx)
  const directory = ctx.configForms.describe()
  const subscribeDirectory = (listener: () => void) => directory.subscribe(listener)
  const getDirectorySnapshot = () => directory.getSnapshot()
  const subscribeLocale = (listener: () => void) => ctx.locale.subscribe(listener)
  const getLocale = () => ctx.locale.getLocale().active
  const Section = (props: SettingsSectionOwnerProps) => {
    const language = useSyncExternalStore(subscribeLocale, getLocale)
    const snapshot = useSyncExternalStore(subscribeDirectory, getDirectorySnapshot)
    useEffect(() => { void directory.ensure() }, [])
    const [selected, setSelected] = useState('')
    const [backend, setBackend] = useState('')
    const namespaces = snapshot.view?.namespaces ?? []
    const policies = namespaces.filter(n => hasSettingsFields(n.schema, ['idleMinutes', 'minHistoryTokens']))
    const backends = namespaces.filter(n => isCodexCapSchema(n.schema))
    const policyId = selectSettingsId(policies, selected)
    const backendId = selectSettingsId(backends, backend)
    const policy = policies.some(n => n.ns === policyId) ? ctx.configForms.get<ContextPolicyConfig>(policyId!) : undefined
    const navigation = ctx.get('pluginNavigation') as { openBundle(name: string): void } | undefined
    const ru = language.startsWith('ru')
    const contextControls = <>{[ { items: policies, value: selected, change: setSelected, label: ru ? 'Политика простоя' : 'Idle policy' }, { items: backends, value: backend, change: setBackend, label: ru ? 'Компонент сжатия' : 'Compaction backend' } ].map(group => group.items.length > 1 ? <SegmentedControl key={group.label} id={group.label} label={group.label} value={group.value} onChange={group.change} options={[{ value: '', label: ru ? 'Выберите…' : 'Select…' }, ...group.items.map(n => ({ value: n.ns, label: n.ns }))]} /> : null)}
    {backends.some(n => n.ns === backendId) ? <CompactionSettings key={backendId} scope={ctx.configForms.get(backendId!)} ru={language.startsWith('ru')} /> : null}
    </>
    return <OpenAiOAuthSection {...props} contextControls={contextControls} language={language} policy={policy} {...(navigation ? { manageComponents: () => {
      props.close()
      navigation.openBundle('dsh-openai-oauth')
    } } : {})} />
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'openai-oauth',
    order: 11,
    label: () => 'OpenAI · Codex',
  }, Section))
}
