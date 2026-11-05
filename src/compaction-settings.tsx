import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { SettingsForm, SettingsFormModel, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'

import { capField } from './context-settings-discovery.js'

export function CompactionSettings({ scope, ru }: { scope: ConfigForm<Record<string, unknown>>; ru: boolean }) {
  const form = useMemo(() => new SettingsFormModel(scope, [capField]), [scope])
  const store = useMemo(() => form.bind(() => ({ ...form.shell(), cap: form.field('thresholdTokens') })), [form])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => () => form.dispose(), [form])
  const actions = form.actions()
  return <SettingsForm state={state} onSave={actions.save} onDiscard={actions.discard} labels={{ save: ru ? 'Сохранить' : 'Save', saving: ru ? 'Сохранение…' : 'Saving…', saveFailed: ru ? 'Не удалось сохранить настройки.' : 'Settings could not be saved.', unavailable: ru ? 'Компонент недоступен.' : 'Unavailable', readOnly: ru ? 'Только чтение.' : 'Read-only' }}>
    <SettingsValueField id="codex-thresholdTokens" numeric disabled={!state.writable} label={ru ? 'Порог компактации, токенов' : 'Absolute compaction cap, tokens'} hint={ru ? 'Сжатие Codex по объёму контекста. Пустое поле возвращает значение из конфигурации профиля. Безопасный порог может быть ниже указанного; сохраняемый хвост должен быть меньше порога. Совместимость бюджета проверяется при сжатии.' : 'Optional positive safe integer. Empty restores the base value. Effective budget may be lower; retained tail must be strictly below it. Budget is checked during compaction, not on save.'} overriddenLabel={ru ? 'Изменено' : 'Overridden'} resetLabel={ru ? 'По умолчанию' : 'Reset to default'} invalidLabel={ru ? 'Введите целое число от 1 до 9 007 199 254 740 991' : 'Enter a positive safe integer'} {...state.cap} onEdit={text => actions.edit('thresholdTokens', text)} onReset={() => actions.resetField('thresholdTokens')} />
  </SettingsForm>
}
