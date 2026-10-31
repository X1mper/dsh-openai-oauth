import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from 'react';
const NS = 'codexUsageLimits';
const dictionaries = {
    en: { used: '{percent}% used', hours: '{count}h', days: '{count}d', minutes: '{count}m', primary: 'Primary window', secondary: 'Secondary window', reset: 'Resets: {time}', loading: 'ChatGPT limits: loading…', unavailable: 'ChatGPT limits unavailable', empty: 'ChatGPT limits not reported', remaining: '{percent}% remaining', duration: 'Window duration: {time}', unknown: 'Not reported', updated: 'Last fetched: {time}', refresh: 'Refresh', explanation: 'ChatGPT usage quota, not a token counter. Only reported windows are shown.', untilReset: 'Time until reset: {time}', seconds: '{count}s' },
    ru: { used: '{percent}% использовано', hours: '{count} ч', days: '{count} д', minutes: '{count} мин', primary: 'Основной лимит', secondary: 'Дополнительный лимит', reset: 'Сброс: {time}', loading: 'Лимиты ChatGPT: загрузка…', unavailable: 'Лимиты ChatGPT недоступны', empty: 'ChatGPT не сообщил лимиты', remaining: '{percent}% осталось', duration: 'Длительность окна: {time}', unknown: 'Не сообщено', updated: 'Последнее получение: {time}', refresh: 'Обновить', explanation: 'Квота использования ChatGPT, а не счётчик токенов. Показаны только сообщённые окна.', untilReset: 'До сброса: {time}', seconds: '{count} с' },
    zh: { used: '已使用 {percent}%', hours: '{count}小时', days: '{count}天', minutes: '{count}分钟', primary: '主要窗口', secondary: '次要窗口', reset: '重置时间：{time}', loading: 'ChatGPT 配额加载中…', unavailable: 'ChatGPT 配额不可用', empty: 'ChatGPT 未提供配额', remaining: '剩余 {percent}%', duration: '窗口时长：{time}', unknown: '未提供', updated: '上次获取：{time}', refresh: '刷新', explanation: '这是 ChatGPT 使用配额，不是令牌计数器。仅显示服务报告的窗口。', untilReset: '距重置：{time}', seconds: '{count}秒' },
};
function windowLabel(row, t) {
    const minutes = row.windowDurationMins;
    if (minutes === null)
        return t(row.window);
    if (minutes % 1440 === 0)
        return t('days', { count: minutes / 1440 });
    if (minutes % 60 === 0)
        return t('hours', { count: minutes / 60 });
    return t('minutes', { count: minutes });
}
export function CodexLimits({ t }) {
    const [snapshot, setSnapshot] = useState();
    const [failed, setFailed] = useState(false);
    const [open, setOpen] = useState(false);
    const panelRef = useRef(null);
    const triggerRef = useRef(null);
    const panelId = useId();
    useEffect(() => {
        if (!open)
            return;
        const close = () => { panelRef.current?.hidePopover(); setOpen(false); };
        const panel = panelRef.current;
        const sync = () => setOpen(panel?.matches(':popover-open') ?? false);
        panel?.addEventListener('toggle', sync);
        window.addEventListener('resize', close);
        return () => { window.removeEventListener('resize', close); panel?.removeEventListener('toggle', sync); };
    }, [open]);
    const [updatedAt, setUpdatedAt] = useState();
    const [refreshKey, setRefreshKey] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        let busy = false;
        const refresh = async () => {
            if (busy || document.hidden)
                return;
            busy = true;
            setRefreshing(true);
            try {
                const response = await fetch('/api/codex-oauth/limits', { credentials: 'same-origin', headers: { accept: 'application/json' }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
                if (!response.ok)
                    throw new Error('Limits unavailable');
                const next = await response.json();
                if (!Array.isArray(next.windows))
                    throw new Error('Invalid limits');
                if (!controller.signal.aborted) {
                    setSnapshot(next);
                    setFailed(false);
                    setUpdatedAt(Date.now());
                    setNow(Date.now());
                }
            }
            catch {
                if (!controller.signal.aborted) {
                    setSnapshot(undefined);
                    setFailed(true);
                }
            }
            finally {
                busy = false;
                if (!controller.signal.aborted)
                    setRefreshing(false);
            }
        };
        void refresh();
        const timer = window.setInterval(() => { void refresh(); }, 30000);
        const visible = () => { if (!document.hidden)
            void refresh(); };
        document.addEventListener('visibilitychange', visible);
        return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
    }, [refreshKey]);
    if (snapshot?.authenticated === false)
        return null;
    const rows = snapshot?.windows ?? [];
    const status = t(failed ? 'unavailable' : snapshot === undefined ? 'loading' : 'empty');
    const percent = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
    const remainingTime = (reset) => {
        const seconds = Math.max(0, Math.ceil(reset - now / 1000));
        return [t('days', { count: Math.floor(seconds / 86400) }), t('hours', { count: Math.floor(seconds / 3600) % 24 }), t('minutes', { count: Math.floor(seconds / 60) % 60 }), t('seconds', { count: seconds % 60 })].join(' ');
    };
    const icon = _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", "aria-hidden": "true", children: [_jsx("path", { d: "M4 16a9 9 0 1 1 16 0M12 12l4-4", strokeLinecap: "round" }), _jsx("circle", { cx: "12", cy: "12", r: "2" })] });
    const toggle = () => {
        const panel = panelRef.current;
        const trigger = triggerRef.current;
        if (!panel || !trigger)
            return;
        if (open) {
            panel.hidePopover();
            setOpen(false);
            return;
        }
        panel.showPopover();
        const anchor = trigger.getBoundingClientRect();
        const box = panel.getBoundingClientRect();
        panel.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12))}px`;
        panel.style.top = `${Math.max(12, anchor.top - box.height - 8)}px`;
        setOpen(true);
    };
    return _jsxs("span", { "data-codex-limits": rows.length ? 'windows' : 'status', style: { display: 'inline-flex', minWidth: 0 }, children: [_jsx("style", { children: `
      .codex-quota-pill{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;max-width:100%;border:0;border-radius:var(--dsw-radius-sm,6px);padding:1px 8px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:20px;font-variant-numeric:tabular-nums;cursor:pointer;white-space:nowrap}
      .codex-quota-pill:hover,.codex-quota-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
      .codex-quota-pill:focus-visible,.codex-quota-refresh:focus-visible{outline:2px solid var(--dsw-alias-label-secondary);outline-offset:2px}
      .codex-quota-panel{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:360px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;border:0;border-radius:var(--dsw-radius-lg,12px);padding:16px;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
      .codex-quota-refresh{border:0;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-interactive-bg-hover);color:inherit;padding:4px 8px;font:inherit;cursor:pointer}
      .codex-quota-refresh:disabled{opacity:.5;cursor:wait}
    ` }), _jsxs("button", { ref: triggerRef, className: "codex-quota-pill", type: "button", "aria-haspopup": "dialog", "aria-expanded": open, "aria-controls": panelId, onClick: toggle, title: rows.length ? t('explanation') : status, children: [icon, _jsx("span", { children: "ChatGPT" }), rows.map(row => _jsxs("span", { style: { color: row.usedPercent >= 90 ? 'var(--dsw-alias-state-warn-primary)' : 'inherit' }, children: [windowLabel(row, t), " \u00B7 ", percent(row.usedPercent), "%"] }, `${row.id}:${row.window}`)), !rows.length && _jsx("span", { "aria-label": status, children: failed ? '!' : snapshot === undefined ? '…' : '—' }), _jsx("svg", { width: "10", height: "10", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", "aria-hidden": "true", children: _jsx("path", { d: open ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4' }) })] }), _jsxs("div", { ref: panelRef, id: panelId, popover: 'auto', role: "dialog", "aria-label": "ChatGPT", className: "codex-quota-panel", children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 10, borderBottom: '0.5px solid var(--dsw-alias-border-l2)' }, children: [_jsxs("strong", { style: { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--dsw-alias-label-primary)', fontWeight: 500 }, children: [icon, " ChatGPT"] }), _jsx("button", { className: "codex-quota-refresh", type: "button", disabled: refreshing, onClick: () => setRefreshKey(value => value + 1), children: t('refresh') })] }), !rows.length && _jsx("p", { role: "status", children: status }), rows.map(row => _jsxs("section", { "data-codex-limit-window": row.window, style: { padding: '12px 0', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }, children: [_jsxs("span", { style: { color: 'var(--dsw-alias-label-primary)', fontWeight: 500 }, children: [row.name, " \u00B7 ", windowLabel(row, t)] }), _jsx("span", { style: { color: row.usedPercent >= 90 ? 'var(--dsw-alias-state-warn-primary)' : 'inherit' }, children: t('used', { percent: percent(row.usedPercent) }) })] }), _jsx("div", { role: "progressbar", "aria-label": row.name + ' · ' + windowLabel(row, t), "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.max(0, Math.min(100, row.usedPercent)), style: { height: 4, borderRadius: 4, background: 'var(--dsw-alias-interactive-bg-hover)', overflow: 'hidden', marginBottom: 8 }, children: _jsx("div", { style: { height: '100%', width: `${Math.max(0, Math.min(100, row.usedPercent))}%`, borderRadius: 'inherit', background: row.usedPercent >= 90 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-label-secondary)' } }) }), _jsx("div", { children: t('remaining', { percent: percent(Math.max(0, 100 - row.usedPercent)) }) }), _jsx("div", { children: t('duration', { time: row.windowDurationMins === null ? t('unknown') : windowLabel(row, t) }) }), _jsx("div", { children: t('reset', { time: row.resetsAt === null ? t('unknown') : new Date(row.resetsAt * 1000).toLocaleString() }) }), _jsx("div", { style: { color: 'var(--dsw-alias-label-tertiary)' }, children: t('untilReset', { time: row.resetsAt === null ? t('unknown') : remainingTime(row.resetsAt) }) })] }, `${row.id}:${row.window}`)), _jsx("div", { style: { marginTop: 10, color: 'var(--dsw-alias-label-tertiary)' }, children: t('updated', { time: updatedAt === undefined ? t('unknown') : new Date(updatedAt).toLocaleString() }) }), _jsx("div", { style: { marginTop: 6, color: 'var(--dsw-alias-label-tertiary)' }, children: t('explanation') })] })] });
}
export function applyLimits(ctx) {
    const locale = ctx.locale;
    for (const [language, dict] of Object.entries(dictionaries))
        ctx.effect(() => locale.register(NS, language, dict), `codex-limits.locale.${language}`);
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'codex-account-limits', order: 2, locale: NS }, CodexLimits));
}
