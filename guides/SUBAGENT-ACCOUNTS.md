# Account-aware subagents

This extension is separate from the ordinary chat model picker. It does **not** register an `auto` LLM provider. Chat accounts remain explicit; child tools discover the intersection of models available to authenticated Codex accounts.

## Composition

Mount `dsh-openai-oauth/subagents` inside each delegating preset. Keep one catalog tool per scope:

```yaml
- id: account-aware-subagent
  name: dsh-openai-oauth/subagents
  config:
    toolName: subagent
    catalogToolName: list_codex_subagent_models
    provider: spawn
- id: account-aware-worker
  name: dsh-openai-oauth/subagents
  config:
    toolName: worker
    catalogToolName: false
    provider: spawn
    agentPreset: pi-worker
    agentOptions:
      model: gpt-6.1-terra
      reasoningEffort: high
```

Replace the corresponding old delegation tool rather than registering the same tool name twice. Do not set a fixed LLM provider under `agentOptions`. The top-level `provider` above names the **subagent backend**, not a Codex account.

## Isolation

At dispatch the parent account is resolved before child route validation and launch. The child receives a concrete provider, not an ambiguous `auto` route. Model and reasoning effort remain role-owned. Nested delegation must mount the same account-aware tool in the nested preset. Existing children retain their chosen concrete account when the parent subsequently changes account.

Metadata-only, signed-out accounts do not contribute models. Failures reading account state or authenticated catalogs must fail closed, not silently shrink the account set or select the default account. Common model support does not imply remaining quota: provider failures are returned, not routed to a different subscription.

## Deployment

Use supported Harness bundle/configuration operations. Never manually edit installed core packages or profile files. Local profile overrides can shadow bundle presets; migration must preserve the complete declaration and change only the intended delegation entries. Existing sessions can retain their original preset revision; verify with a new session after application. Do not remove an active provider or restart during active turns.

This is a separate subagent catalog, not a hidden entry in the shared built-in `list_subagent_models` catalog. Visibility is achieved by not registering a global LLM provider at all.
