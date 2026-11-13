import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionStandardProps, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { LimitWindow } from './limits.js'
import { accountIdForProvider, accountPath, type NamedAccount } from './account-ui.js'
import { CodexContextIndicator, contextDictionaries } from './context-indicator-client.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap { 'conversation.composer.dock': { kind: 'list'; scope: 'session' } }
  interface LocaleNamespaceMap { codexUsageLimits: 'used' | 'hours' | 'days' | 'minutes' | 'primary' | 'secondary' | 'reset' | 'loading' | 'unavailable' | 'empty' | 'remaining' | 'duration' | 'unknown' | 'updated' | 'refresh' | 'explanation' | 'untilReset' | 'seconds' | 'label' | 'estimate' | 'sample' | 'unknownContext' | 'details' }
}
const NS = 'codexUsageLimits'
const dictionaries = {
  en: { used: '{percent}% used', hours: '{count}h', days: '{count}d', minutes: '{count}m', primary: 'Primary window', secondary: 'Secondary window', reset: 'Resets: {time}', loading: 'ChatGPT limits: loading…', unavailable: 'ChatGPT limits unavailable', empty: 'ChatGPT limits not reported', remaining: '{percent}% remaining', duration: 'Window duration: {time}', unknown: 'Not reported', updated: 'Last fetched: {time}', refresh: 'Refresh', explanation: 'ChatGPT usage quota, not a token counter. Only reported windows are shown.', untilReset: 'Time until reset: {time}', seconds: '{count}s' },
  ru: { used: '{percent}% использовано', hours: '{count} ч', days: '{count} д', minutes: '{count} мин', primary: 'Основной лимит', secondary: 'Дополнительный лимит', reset: 'Сброс: {time}', loading: 'Лимиты ChatGPT: загрузка…', unavailable: 'Лимиты ChatGPT недоступны', empty: 'ChatGPT не сообщил лимиты', remaining: '{percent}% осталось', duration: 'Длительность окна: {time}', unknown: 'Не сообщено', updated: 'Последнее получение: {time}', refresh: 'Обновить', explanation: 'Квота использования ChatGPT, а не счётчик токенов. Показаны только сообщённые окна.', untilReset: 'До сброса: {time}', seconds: '{count} с' },
  zh: { used: '已使用 {percent}%', hours: '{count}小时', days: '{count}天', minutes: '{count}分钟', primary: '主要窗口', secondary: '次要窗口', reset: '重置时间：{time}', loading: 'ChatGPT 配额加载中…', unavailable: 'ChatGPT 配额不可用', empty: 'ChatGPT 未提供配额', remaining: '剩余 {percent}%', duration: '窗口时长：{time}', unknown: '未提供', updated: '上次获取：{time}', refresh: '刷新', explanation: '这是 ChatGPT 使用配额，不是令牌计数器。仅显示服务报告的窗口。', untilReset: '距重置：{time}', seconds: '{count}秒' },
}
type T = TranslateNS<typeof NS>
function windowLabel(row: LimitWindow, t: T): string {
  const minutes = row.windowDurationMins
  if (minutes === null) return t(row.window)
  if (minutes % 1440 === 0) return t('days', { count: minutes / 1440 })
  if (minutes % 60 === 0) return t('hours', { count: minutes / 60 })
  return t('minutes', { count: minutes })
}

export function CodexLimits({ t, useProjection }: { t: T; useProjection: SessionStandardProps['useProjection'] }): ReactNode {
  const selection = useProjection('modelSelection')
  const provider = (selection?.next ?? selection?.lastUsed)?.provider
  const [accounts, setAccounts] = useState<NamedAccount[]>()
  useEffect(() => {
    const controller = new AbortController()
    const refresh = async (): Promise<void> => {
      try {
        const response = await fetch('/api/codex-oauth/accounts', { credentials: 'same-origin', signal: controller.signal })
        if (!response.ok) throw new Error('Accounts unavailable')
        const data = await response.json() as { accounts: NamedAccount[] }
        if (!controller.signal.aborted && Array.isArray(data.accounts)) setAccounts(data.accounts)
      } catch { /* Never infer a named account from a slug. */ }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [provider])
  const accountId = accountIdForProvider(provider, accounts)
  return accountId ? <CodexLimitsPolling key={accountId} accountId={accountId} provider={provider!} t={t} useProjection={useProjection}/> : null
}

function CodexLimitsPolling({ t, useProjection, accountId, provider }: { accountId: string; provider: string; t: T; useProjection: SessionStandardProps['useProjection'] }): ReactNode {
  const [snapshot, setSnapshot] = useState<{ authenticated: boolean; windows: LimitWindow[] }>()
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  useEffect(() => {
    if (!open) return
    const close = (): void => { panelRef.current?.hidePopover(); setOpen(false) }
    const panel = panelRef.current
    const sync = (): void => setOpen(panel?.matches(':popover-open') ?? false)
    panel?.addEventListener('toggle', sync)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('resize', close); panel?.removeEventListener('toggle', sync) }
  }, [open])
  const [updatedAt, setUpdatedAt] = useState<number>()
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let busy = false
    const refresh = async (): Promise<void> => {
      if (busy || document.hidden) return
      busy = true
      setRefreshing(true)
      try {
        const response = await fetch('/api/codex-oauth' + accountPath(accountId, '/limits'), { credentials: 'same-origin', headers: { accept: 'application/json' }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
        if (!response.ok) throw new Error('Limits unavailable')
        const next = await response.json() as { authenticated: boolean; windows: LimitWindow[] }
        if (!Array.isArray(next.windows)) throw new Error('Invalid limits')
        if (!controller.signal.aborted) { setSnapshot(next); setFailed(false); setUpdatedAt(Date.now()); setNow(Date.now()) }
      } catch {
        if (!controller.signal.aborted) { setSnapshot(undefined); setFailed(true) }
      } finally { busy = false; if (!controller.signal.aborted) setRefreshing(false) }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30000)
    const visible = (): void => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', visible)
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [refreshKey])
  // Keep context accessible even when account quota is unavailable.
  const rows = snapshot?.windows ?? []
  const status = t(failed ? 'unavailable' : snapshot === undefined ? 'loading' : 'empty')
  const percent = (value: number): string => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)
  const remainingTime = (reset: number): string => {
    const seconds = Math.max(0, Math.ceil(reset - now / 1000))
    return [t('days', { count: Math.floor(seconds / 86400) }), t('hours', { count: Math.floor(seconds / 3600) % 24 }), t('minutes', { count: Math.floor(seconds / 60) % 60 }), t('seconds', { count: seconds % 60 })].join(' ')
  }
  const icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 16a9 9 0 1 1 16 0M12 12l4-4" strokeLinecap="round"/><circle cx="12" cy="12" r="2"/></svg>
  const toggle = (): void => {
    const panel = panelRef.current
    const trigger = triggerRef.current
    if (!panel || !trigger) return
    if (open) { panel.hidePopover(); setOpen(false); return }
    panel.showPopover()
    const anchor = trigger.getBoundingClientRect()
    const box = panel.getBoundingClientRect()
    panel.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12))}px`
    panel.style.top = `${Math.max(12, anchor.top - box.height - 8)}px`
    setOpen(true)
  }
  return <span data-codex-limits={rows.length ? 'windows' : 'status'} style={{ display: 'inline-flex', minWidth: 0 }}>
    <style>{`
      /* Presentation-only compatibility selector for Harness 0.2.1-rc.5.
         Scoped to this composer and only while its Codex control is mounted. */
      [data-composer-dock]:has([data-codex-limits]) > .JObwrW_root,
      [data-composer-dock]:has([data-codex-limits]) [data-composer-stat="usage"]{display:none}
      .codex-quota-pill{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;max-width:100%;border:0;border-radius:var(--dsw-radius-sm,6px);padding:1px 8px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:20px;font-variant-numeric:tabular-nums;cursor:pointer;white-space:nowrap}
      .codex-quota-pill:hover,.codex-quota-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
      .codex-quota-pill:focus-visible,.codex-quota-refresh:focus-visible{outline:2px solid var(--dsw-alias-label-secondary);outline-offset:2px}
      .codex-quota-panel{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:360px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;border:0;border-radius:var(--dsw-radius-lg,12px);padding:16px;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
      .codex-quota-refresh{border:0;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-interactive-bg-hover);color:inherit;padding:4px 8px;font:inherit;cursor:pointer}
      .codex-quota-refresh:disabled{opacity:.5;cursor:wait}
    `}</style>
    <button ref={triggerRef} className="codex-quota-pill" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId} onClick={toggle} title={rows.length ? t('explanation') : status}>
      {icon}<span title={provider}>Codex{accountId === 'default' ? '' : ' · ' + provider}</span>
      {rows.map(row => <span key={`${row.id}:${row.window}`} title={windowLabel(row, t)} style={{ color: row.usedPercent >= 90 ? 'var(--dsw-alias-state-warn-primary)' : 'inherit' }}>{percent(row.usedPercent)}%</span>)}
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d={open ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4'}/></svg>
    </button>
    <div ref={panelRef} id={panelId} {...{ popover: 'auto' }} role="dialog" aria-label="ChatGPT" className="codex-quota-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 10, borderBottom: '0.5px solid var(--dsw-alias-border-l2)' }}>
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--dsw-alias-label-primary)', fontWeight: 500 }}>{icon} ChatGPT</strong>
        <button className="codex-quota-refresh" type="button" disabled={refreshing} onClick={() => setRefreshKey(value => value + 1)}>{t('refresh')}</button>
      </div>
      <CodexContextIndicator useProjection={useProjection} t={(key) => t(key === 'unknown' ? 'unknownContext' : key)}/>
      {!rows.length && <p role="status">{status}</p>}
      {rows.map(row => <section key={`${row.id}:${row.window}`} data-codex-limit-window={row.window} style={{ padding: '12px 0', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <span style={{ color: 'var(--dsw-alias-label-primary)', fontWeight: 500 }}>{row.name} · {windowLabel(row, t)}</span>
          <span style={{ color: row.usedPercent >= 90 ? 'var(--dsw-alias-state-warn-primary)' : 'inherit' }}>{t('used', { percent: percent(row.usedPercent) })}</span>
        </div>
        <div role="progressbar" aria-label={row.name + ' · ' + windowLabel(row, t)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, row.usedPercent))} style={{ height: 4, borderRadius: 4, background: 'var(--dsw-alias-interactive-bg-hover)', overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, row.usedPercent))}%`, borderRadius: 'inherit', background: row.usedPercent >= 90 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-label-secondary)' }}/>
        </div>
        <div>{t('remaining', { percent: percent(Math.max(0, 100 - row.usedPercent)) })}</div>
        <div>{t('duration', { time: row.windowDurationMins === null ? t('unknown') : windowLabel(row, t) })}</div>
        <div>{t('reset', { time: row.resetsAt === null ? t('unknown') : new Date(row.resetsAt * 1000).toLocaleString() })}</div>
        <div style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{t('untilReset', { time: row.resetsAt === null ? t('unknown') : remainingTime(row.resetsAt) })}</div>
      </section>)}
      <div style={{ marginTop: 10, color: 'var(--dsw-alias-label-tertiary)' }}>{t('updated', { time: updatedAt === undefined ? t('unknown') : new Date(updatedAt).toLocaleString() })}</div>
      <div style={{ marginTop: 6, color: 'var(--dsw-alias-label-tertiary)' }}>{t('explanation')}</div>
    </div>
  </span>
}

export function applyLimits(ctx: ClientContext): void {
  const locale = (ctx as unknown as { locale: { register(ns: string, language: string, dict: Record<string, string>): () => void } }).locale
  for (const [language, dict] of Object.entries(dictionaries)) ctx.effect(() => locale.register(NS, language, { ...dict, ...contextDictionaries[language as keyof typeof contextDictionaries], unknown: dict.unknown, unknownContext: contextDictionaries[language as keyof typeof contextDictionaries].unknown }), `codex-limits.locale.${language}`)
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'codex-account-limits', order: 2, locale: NS }, CodexLimits))
}
