import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { isCodexProvider } from './codex-route.js';
const NS = 'codexContext';
export const contextDictionaries = {
    en: { label: 'Codex context', estimate: 'estimate', sample: 'last request + estimated growth', unknown: 'not available', details: 'Approximate occupied context, not billing or ChatGPT quota. Hidden image/provider overhead and in-flight output may be missing.' },
    ru: { label: 'Контекст Codex', estimate: 'оценка', sample: 'последний запрос + оценка прироста', unknown: 'нет данных', details: 'Приблизительно занятый контекст, не billing и не квота ChatGPT. Скрытые затраты провайдера/изображений и текущий незавершённый ответ могут не учитываться.' },
    zh: { label: 'Codex 上下文', estimate: '估算', sample: '最近请求 + 估算增量', unknown: '暂无数据', details: '估算的上下文占用，不是计费用量或 ChatGPT 配额。可能不包括隐藏的图片/提供方开销及正在生成的输出。' },
};
export function contextForRoute(view, route) {
    return route && isCodexProvider(route.provider) && view?.provider === route.provider && view.model === route.model ? view : null;
}
export function CodexContextIndicator({ t, useProjection }) {
    const selection = useProjection('modelSelection');
    const raw = useProjection('codexContext');
    const route = selection?.next ?? selection?.lastUsed;
    if (!isCodexProvider(route?.provider))
        return null;
    const view = contextForRoute(raw, route);
    const total = view?.totalTokens;
    const capacity = view?.capacity;
    const percent = total != null && capacity != null ? Math.round(total / capacity * 100) : null;
    const amount = total == null ? t('unknown') : total.toLocaleString() + (capacity != null ? ' / ' + capacity.toLocaleString() : '');
    const source = view?.source === 'contextUsage' ? t('sample') : t('estimate');
    return _jsxs("span", { "data-codex-context": "", title: t('details'), style: { display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', padding: '4px 8px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 }, children: [_jsx("span", { children: t('label') }), _jsxs("span", { children: [total != null ? '≈ ' : '', amount, percent === null ? '' : ' · ' + percent + '%'] }), total != null && _jsxs("span", { style: { opacity: 0.75 }, children: ["(", source, ")"] }), percent !== null && _jsx("span", { role: "meter", "aria-label": t('label'), "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.min(100, Math.max(0, percent)), "aria-valuetext": amount, style: { display: 'inline-block', width: 42, height: 4, background: 'var(--dsw-alias-interactive-bg-hover)', borderRadius: 3 }, children: _jsx("span", { style: { display: 'block', height: '100%', width: Math.min(100, Math.max(0, percent)) + '%', background: percent >= 90 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-label-secondary)', borderRadius: 3 } }) })] });
}
export function applyContextIndicator(ctx) {
    const locale = ctx.locale;
    for (const [lang, dict] of Object.entries(contextDictionaries))
        ctx.effect(() => locale.register(NS, lang, dict), 'codex-context.locale.' + lang);
    // Context is rendered inside the Codex limits panel, not as a second dock item.
}
