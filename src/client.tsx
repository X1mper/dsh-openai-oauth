import type {} from '@deepseek-ai/dsh-client-locale/client'
import { Button, DisclosureRow, StateDot, SegmentedControl, Menu, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { hasSettingsFields, isCodexCapSchema, selectSettingsId } from './context-settings-discovery.js'
import { CompactionSettings } from './compaction-settings.js'
import { ContextSettings } from './context-settings.js'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ContextPolicyConfig } from './context-policy.js'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { accountPath, safeAuthUrl, type NamedAccount } from './account-ui.js'
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

async function request<T>(path = '', method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
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

function AccountSection({ account, policy, contextControls, manageComponents, language = 'en' }: SettingsSectionOwnerProps & { account: NamedAccount; contextControls?: ReactNode; language?: string; policy?: ConfigForm<ContextPolicyConfig>; manageComponents?: () => void }): ReactNode {
  const ru = language.startsWith('ru')
  const copy = pageCopy(language)
  const [limits, setLimits] = useState<string>()
  const [limitsBusy, setLimitsBusy] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [status, setStatus] = useState<Status | undefined>()
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [authUrl, setAuthUrl] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  const alive = useRef(true)
  const sequence = useRef(0)
  const refreshing = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++ } }, [])
  const refresh = useCallback(async (): Promise<Status | undefined> => {
    if (refreshing.current) return undefined
    refreshing.current = true
    try {
      const ticket = ++sequence.current
      const next = await request<Status>(accountPath(account.id))
      if (!alive.current || ticket !== sequence.current) return undefined
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
    } finally { refreshing.current = false }
  }, [account.id])

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
      const result = await request<{ authUrl?: string }>(accountPath(account.id, '/login'), 'POST')
      if (!alive.current) { popup?.close(); return }
      const url = safeAuthUrl(result.authUrl)
      setAuthUrl(url)
      setWaiting(true)
      if (popup !== null) popup.location.href = url
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
      sequence.current++
      setWaiting(false)
      setAuthUrl(undefined)
      await request(accountPath(account.id, '/logout'), 'POST')
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
      <p style={styles.meta}>{ru ? 'В выборе модели выберите провайдер' : 'In the model picker, choose provider'}: <strong>{account.name}</strong> · <code>{account.provider}</code>. {ru ? 'Аккаунты работают независимо; автоматического переключения нет.' : 'Accounts run independently; there is no automatic switching.'}</p>
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
          <Button disabled={limitsBusy} onClick={() => {
            setLimitsBusy(true)
            void request<{ windows: { name: string; window: string; usedPercent: number }[] }>(accountPath(account.id, '/limits')).then(result => {
              if (alive.current) setLimits(result.windows.map(row => row.name + ' · ' + row.window + ': ' + row.usedPercent + '%').join(' / ') || (ru ? 'Лимиты не сообщены' : 'Limits not reported'))
            }).catch(reason => { if (alive.current) setError(String(reason)) }).finally(() => { if (alive.current) setLimitsBusy(false) })
          }}>{ru ? 'Лимиты выбранного аккаунта' : 'Selected account limits'}</Button>
          {limits ? <p role="status">{limits}</p> : null}
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

export function OpenAiOAuthSection(props: Parameters<typeof AccountSection>[0] extends infer P ? Omit<P, 'account'> : never): ReactNode {
  const ru = props.language?.startsWith('ru')
  const [accounts, setAccounts] = useState<NamedAccount[]>([{ id: 'default', name: 'Default', provider: 'openai-codex' }])
  const [selected, setSelected] = useState('default')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void request<{ accounts: NamedAccount[] }>('/accounts').then(result => {
      if (active) setAccounts(result.accounts)
    }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [])
  const account = accounts.find(item => item.id === selected) ?? accounts[0]
  const save = async (rename: boolean): Promise<void> => {
    if (!name.trim() || !account) return
    setBusy(true); setError('')
    try {
      const result = await request<{ account: NamedAccount }>(rename ? '/accounts/' + encodeURIComponent(account.id) : '/accounts', rename ? 'PATCH' : 'POST', { name: name.trim() })
      const list = await request<{ accounts: NamedAccount[] }>('/accounts')
      setAccounts(list.accounts)
      if (!rename) setSelected(result.account.id)
      setName('')
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  return <>
    <div style={{ ...styles.card, maxWidth: 680, marginBottom: 16 }}>
      <div style={styles.row}>
        <span>{ru ? 'Аккаунт' : 'Account'}</span>
        <Menu
          open={accountMenuOpen && !busy}
          selectedId={account?.id}
          items={accounts.map(item => ({ id: item.id, label: item.name }))}
          onSelect={id => { setSelected(id); setName(''); setError(''); setAccountMenuOpen(false) }}
          onClose={() => setAccountMenuOpen(false)}
          anchor={<Button disabled={busy} aria-label={ru ? 'Выбрать аккаунт' : 'Choose account'} aria-haspopup="menu" aria-expanded={accountMenuOpen && !busy} onClick={() => setAccountMenuOpen(value => !value)}>{account?.name ?? (ru ? 'Выбрать' : 'Choose')} ▾</Button>}
        />
      </div>
      <div style={styles.actions}>
        <Input aria-label={ru ? 'Имя аккаунта' : 'Account name'} placeholder={ru ? 'Личный / Рабочий' : 'Personal / Work'} value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)} />
        <Button disabled={busy || !name.trim()} onClick={() => { void save(false) }}>{ru ? 'Добавить аккаунт' : 'Add account'}</Button>
        <Button disabled={busy || !name.trim()} onClick={() => { void save(true) }}>{ru ? 'Переименовать выбранный' : 'Rename selected'}</Button>
      </div>
      {error ? <p role="alert" style={styles.error}>{error}</p> : null}
    </div>
    {account ? <AccountSection key={account.id} {...props} account={account} /> : null}
  </>
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
