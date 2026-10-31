import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { SettingsForm, SettingsFormModel, SettingsValueField, settingsNumberField } from '@deepseek-ai/dsh-client-ui-primitives';
export function ContextSettings({ scope, ru }) {
    const form = useMemo(() => new SettingsFormModel(scope, [settingsNumberField('idleMinutes'), settingsNumberField('minHistoryTokens')]), [scope]);
    const store = useMemo(() => form.bind(() => ({ ...form.shell(), idleMinutes: form.field('idleMinutes'), minHistoryTokens: form.field('minHistoryTokens') })), [form]);
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
    useEffect(() => () => form.dispose(), [form]);
    const actions = form.actions();
    return _jsx(SettingsForm, { state: state, onSave: actions.save, onDiscard: actions.discard, labels: {
            unavailable: ru ? 'Компонент политики контекста недоступен.' : 'Context policy component is unavailable.',
            readOnly: ru ? 'Настройки доступны только для чтения.' : 'Settings are read-only.',
            saveFailed: ru ? 'Настройки не сохранены. Проверь значения и повтори.' : 'Settings were not saved. Check the values and retry.',
            save: ru ? 'Сохранить' : 'Save', saving: ru ? 'Сохранение…' : 'Saving…',
        }, children: ['idleMinutes', 'minHistoryTokens'].map(field => _jsx(SettingsValueField, { id: `codex-${field}`, numeric: true, disabled: !state.writable, label: field === 'idleMinutes' ? (ru ? 'Сжимать после простоя, минут' : 'Compact after idle minutes') : (ru ? 'Минимальный объём истории, токенов' : 'Minimum history tokens'), hint: field === 'idleMinutes' ? (ru ? 'По умолчанию 30 минут. 0 отключает сжатие по времени. Проверяется перед продолжением диалога.' : 'Default: 30 minutes. 0 disables idle compaction. Checked before continuing a conversation.') : (ru ? 'Короткие диалоги не сжимаются. Это оценка объёма, а не счёт за использование.' : 'Short conversations are skipped. This is a size estimate, not a usage bill.'), overriddenLabel: ru ? 'Изменено' : 'Overridden', resetLabel: ru ? 'По умолчанию' : 'Reset to default', invalidLabel: ru ? 'Введи число' : 'Enter a number', ...state[field], onEdit: text => actions.edit(field, text), onReset: () => actions.resetField(field) }, field)) });
}
