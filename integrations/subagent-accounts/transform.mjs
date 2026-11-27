const STOCK = '@deepseek-ai/dsh-tool-subagent';
export const MODULE = 'dsh-openai-oauth/subagents';
export const presetIds = new Set(['standard', 'pi-supersearcher', 'pi-superworker', 'pi-pixel', 'pi-sugar-taster', 'pi-worker', 'pi-workflow']);

// Only plugin entry lists are traversed; arbitrary persona/config strings are untouched.
export function transformPreset(config) {
  if (!presetIds.has(config.id)) return { config, changes: [] };
  const changes = [];
  let catalog = false;
  function walk(rows) {
    return rows.map(row => {
      if (row.group === true && Array.isArray(row.config)) return { ...row, config: walk(row.config) };
      const c = row.config ?? {};
      if (row.name === MODULE) { if (c.catalogToolName !== false) catalog = true; return row; }
      if (row.name !== STOCK || (c.provider ?? 'spawn') !== 'spawn') return row;
      const named = c.agentOptions?.provider === 'openai-codex';
      const generic = row.id === 'tool-subagent' && c.toolName === 'subagent' && !c.agentOptions?.provider;
      if (!named && !generic) return row;
      const allowed = new Set(['provider', 'toolName', 'agentPreset', 'agentOptions', 'maxDepth', 'modelSelectionSettings']);
      if (Object.keys(c).some(key => !allowed.has(key))) throw new Error('Unsupported tool config: ' + row.id);
      const options = { ...c.agentOptions };
      if (named) delete options.provider;
      if (Object.keys(options).some(key => !['model', 'reasoningEffort'].includes(key))) throw new Error('Unsupported agentOptions: ' + row.id);
      const next = { ...c, catalogToolName: catalog ? false : 'list_codex_subagent_models' };
      catalog = true;
      delete next.modelSelectionSettings;
      if (c.agentOptions) next.agentOptions = options;
      changes.push({ id: row.id, toolName: c.toolName, model: options.model, reasoningEffort: options.reasoningEffort });
      return { ...row, name: MODULE, config: next };
    });
  }
  const plugins = walk(config.plugins);
  return { config: changes.length ? { ...config, plugins } : config, changes };
}
