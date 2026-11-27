import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { serialize, deserialize } from 'node:v8';
import { createHash } from 'node:crypto';
import { transformPreset, presetIds } from './transform.mjs';
import { defineTool } from '@deepseek-ai/dsh-tools';
export const inject = ['configEditor', 'tools'];
export function apply(ctx, config = {}) {
  registerMigrationTool(ctx, config, defineTool);
}
export function registerMigrationTool(ctx, config, define = defineTool) {
  ctx.tools.register(define({
    name: 'codex_apply_subagent_accounts',
    description: 'Run the configured Codex role-account migration with guarded backup/resume, or its configured dry-run/rollback. Changes preset declarations for new sessions; existing sessions retain their revision. Returns sanitized status.',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => false,
    async execute() {
      try {
        const result = await migrate(ctx, config);
        return { status: 'complete', mode: config.mode ?? 'dry-run', completed: result.completed ?? [], report: JSON.parse(JSON.stringify(result.report ?? [])) };
      } catch (error) {
        return { status: 'failed', mode: config.mode ?? 'dry-run', code: errorCode(error), ...errorDetails(error) };
      }
    },
  }));
}
function errorCode(error) {
  const message = String(error?.message ?? '');
  const known = [
    [/HMR transactions cannot be nested/, 'NESTED_HMR_TRANSACTION'],
    [/atomic-write: timed out waiting for the writer lock/, 'WRITER_LOCK_TIMEOUT'],
    [/profile reload requires the root Include entry/, 'ROOT_INCLUDE_MISSING'],
    [/failed to read profile manifest/, 'PROFILE_MANIFEST_READ'],
    [/cannot resolve profile bundle/, 'PROFILE_BUNDLE_RESOLUTION'],
    [/failed to read patches/, 'PATCH_READ_FAILURE'],
    [/failed to parse/, 'PROFILE_PARSE_FAILURE'],
    [/each entry must be a mapping/, 'INVALID_ENTRY_MAPPING'],
    [/activation.*fail|failed.*activat|Failed to activate/i, 'PLUGIN_ACTIVATION_FAILURE'],
    [/Preset changed during migration/, 'CURRENT_CONFIG_CONFLICT'],
    [/Preset changed since migration/, 'ROLLBACK_CONFLICT'],
    [/Configuration entry changed during reload/, 'ENTRY_REPLACED_DURING_RECONCILE'],
    [/Configuration entry is no longer available/, 'ENTRY_UNAVAILABLE'],
    [/Configuration plugin is no longer active/, 'ENTRY_INACTIVE'],
    [/overridden by a home patch or command-line overlay/, 'HIGHER_PRIORITY_OVERRIDE'],
    [/Cannot find|cannot find|not found|ERR_MODULE_NOT_FOUND|not exported/, 'MODULE_RESOLUTION'],
    [/Unsupported tool config|Unsupported agentOptions/, 'UNSUPPORTED_ROLE_CONFIG'],
    [/backup does not match/, 'BACKUP_CONFLICT'],
  ];
  return known.find(([pattern]) => pattern.test(message))?.[1] ??
    (['EEXIST','ENOENT','EACCES','EPERM'].includes(error?.code) ? error.code : 'LOADER_OR_VALIDATION_FAILURE');
}
function errorDetails(error) {
  const stack = typeof error?.stack === 'string' ? error.stack : '';
  const frames = [...stack.matchAll(/node_modules\/(\@[^/]+\/[^/]+|[^/]+)\/([A-Za-z0-9/_.-]+):(\d+):(\d+)/g)]
    .slice(0, 5).map(match => ({ package: match[1], file: match[2], line: Number(match[3]) }));
  return {
    errorName: /^[A-Za-z]{1,40}Error$|^Error$/.test(error?.name) ? error.name : 'UnknownError',
    ...(typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,60}$/.test(error.code) ? { runtimeCode: error.code } : {}),
    messageHash: createHash('sha256').update(String(error?.message ?? '')).digest('hex').slice(0, 16),
    frames
  };
}
const currentOf = row => Object.keys(row.override).length ? row.override : row.inherited;
const eligible = current => presetIds.has(current.id) && current.id !== 'pi-workflow';
function decodeBackup(text) {
  const value = JSON.parse(text);
  if (value.format === 'subagent-accounts-v1') return value;
  if (value.format === 'subagent-accounts-v2') return deserialize(Buffer.from(value.snapshot, 'base64'));
  throw new Error('Unsupported backup format');
}
export async function migrate(ctx, config = {}) {
  const mode = config.mode ?? 'dry-run';
  let stage = 'configuration', preset;
  const completed = [];
  const status = async (state, extra = {}) => {
    if (config.reportPath) await writeFile(config.reportPath,
      JSON.stringify({ mode, status: state, stage, ...(preset ? {preset} : {}), completed, ...extra }),
      { mode: 0o600 });
  };
  try {
    if (!['dry-run', 'apply', 'rollback'].includes(mode)) throw new Error('Invalid migration mode');
    const editor = ctx.configEditor;
    const rows = () => editor.configuration().filter(x => x.entry.options.name === '@deepseek-ai/dsh-agent-preset');
    const plans = [];
    for (const row of rows()) {
      const current = currentOf(row);
      if (!eligible(current)) continue;
      const result = transformPreset(current);
      if (result.changes.length) plans.push({ current, next: result.config, changes: result.changes });
    }
    const report = plans.map(p => ({ preset: p.current.id, changes: p.changes }));
    stage = 'planning';
    await status('planned', { report });
    if (mode === 'dry-run') return { report };
    if (!config.backupPath?.startsWith('/')) throw new Error('Explicit absolute private backupPath required');
    stage = 'backup-read';
    let backup;
    try { backup = decodeBackup(await readFile(config.backupPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT' || mode === 'rollback') throw error; }
    if (mode === 'apply' && !backup) {
      backup = { rows: plans.map(p => ({ before: p.current, after: p.next })) };
      stage = 'backup-create';
      // V8 structured serialization preserves undefined values and raw expression markers.
      const encoded = serialize(backup);
      if (!isDeepStrictEqual(deserialize(encoded), backup)) throw new Error('Backup serialization mismatch');
      await writeFile(config.backupPath, JSON.stringify({ format: 'subagent-accounts-v2', snapshot: encoded.toString('base64') }), { mode: 0o600, flag: 'wx' });
    }
    if (!backup) throw new Error('Missing backup');
    // Validate ALL snapshots before editing ANY row. Existing backup is never replaced.
    stage = 'backup-validation';
    for (const saved of backup.rows) {
      preset = saved.before.id;
      const row = rows().find(x => currentOf(x).id === preset);
      if (!row || !eligible(saved.before)) throw new Error('Existing backup does not match active preset');
      const current = currentOf(row);
      if (!isDeepStrictEqual(current, saved.before) && !isDeepStrictEqual(current, saved.after))
        throw new Error('Existing backup does not match current config');
      if (mode === 'apply' && !isDeepStrictEqual(transformPreset(saved.before).config, saved.after))
        throw new Error('Existing backup does not match current transformation');
    }
    if (mode === 'apply' && plans.some(p => !backup.rows.some(saved => saved.before.id === p.current.id)))
      throw new Error('Existing backup does not match migration scope');
    for (const saved of mode === 'rollback' ? [...backup.rows].reverse() : backup.rows) {
      preset = saved.before.id;
      // Reacquire entry identity after every Loader reconciliation.
      stage = 'entry-lookup';
      const row = rows().find(x => currentOf(x).id === preset);
      const target = mode === 'rollback' ? saved.before : saved.after;
      if (isDeepStrictEqual(currentOf(row), target)) { completed.push(preset); continue; }
      stage = 'edit-before-callback';
      await status('running');
      await editor.edit(row.entry, current => {
        stage = 'edit-callback';
        const expected = mode === 'rollback' ? saved.after : saved.before;
        if (!isDeepStrictEqual(current, expected)) throw new Error(mode === 'rollback' ? 'Preset changed since migration' : 'Preset changed during migration');
        stage = 'edit-reconcile';
        return target;
      });
      completed.push(preset);
      await status('running');
    }
    stage = 'complete'; preset = undefined;
    await status('complete', { report });
    return { report, completed };
  } catch (error) {
    await status('failed', { code: errorCode(error), ...errorDetails(error) }).catch(() => {});
    throw error;
  }
}
