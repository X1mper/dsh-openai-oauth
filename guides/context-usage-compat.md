# Codex context indicator and pressure backend (0.7.0)

## No host patches

This release uses public plugin services and slots. It does not patch Harness files, modify its built-in context meter implementation, or change historical billing. Cumulative usage remains billing; validated latest-request `contextUsage` is a separate occupancy sample.

## Indicator

The bundle registers `dsh-openai-oauth/context-indicator`. A custom session projection travels through Harness's existing session transport; there is no new HTTP endpoint or polling. It retains only numeric surface-node prices and route metadata, not conversation text or a duplicate log.

The composer shows one **Codex** quota button only when the effective selection is `openai-codex`. Reported quota percentages remain on the button; context details live inside its popover. Pending model changes suppress the previous route's values. Capacity must match the same durable provider/model; no model window is hardcoded.

The displayed approximate total uses the last valid request sample plus estimated subsequent growth, or fixed-density surface/tool estimates after replacement. It is neither billing nor ChatGPT quota. The tooltip explains that hidden provider/image overhead and in-flight output may be missing. Offload invalidates stale fallback values: unavailable is preferable to a made-up number. The plugin hides the native context and billing widgets in the same composer while its Codex button is mounted. Removing that control or switching to another provider restores the native widgets. This is a presentation-only selector pinned to rc.5; native billing data is unchanged.

## Compaction activation (explicit)

Installing the release enables the indicator, **not** automatic backend replacement. In the existing isolated compaction group, replace ONLY the module name of the existing entry:

```yaml
- id: compaction-basic
  name: dsh-openai-oauth/compaction
  # preserve your existing config
```

Keep its id, scope and configuration. Keep `auto:true` (the default). Do not install a second engine. This module subclasses BasicCompactionEngine and uses its public region transaction. The rc.5 type contract explicitly dispatches automatic compaction through overrides of `compactIfNeeded`; broader docs describe `summarize` as the primary extension hook, so compatibility is pinned and tested against **0.2.1-rc.5**, not promised for arbitrary future releases.

Native manual compaction and provider-confirmed overflow recovery remain unchanged. Non-Codex pressure delegates to Basic. During a model switch involving Codex, proactive work waits for the durable header to match the assembled route rather than summarize under the previous provider. This capture supports stock Harness model selection, not arbitrary late routing middleware.

Pressure does not re-summarize a checkpoint plus a few tiny exchanges. The selected span must contain meaningful additional material (at least 1,024 estimated tokens and half the checkpoint size). This guard is reconstructed from the current surface, including after replay. Provider-confirmed overflow can still force native reduction.

Within a pressure-compaction pass, estimated fixed overhead is preserved across the engine's own pruning/replacement rather than declaring success solely because a replacement invalidated the provider sample. The retained-history budget accounts for that overhead. These remain conservative estimates, not a guarantee of the next provider request's size; route and unrelated-history invalidation are unchanged.

## Shared tools

Search and images remain available across providers. Codex fetch is global, not route-aware. For strict isolation use this profile overlay:

```yaml
- id: web
  config:
    searchProvider: openai-codex
    fetchProvider: http
- id: codex-web-fetch
  disabled: true
```

## Verification and limits

Tests use real Session, TokenMeter, model-selection middleware, projection registry and inherited compaction transactions. They cover billing separation, replacement, serialized replay, route changes, cancellation, bounded overflow recovery, and additional compaction after new work. Model summaries are controlled test doubles, not claims of live-provider or full JSONL-storage end-to-end coverage.

Local shrink checks remain heuristic and may reject a non-shrinking summary after provider cost. Pending input and hidden provider overhead are not predicted exactly. Restart Harness and refresh the Web page after upgrading so both server projection and compiled client are loaded.

## Dynamic tool permission boundary (0.7.0)

Native environment tools remain disabled with `environments: []`. Conversation turns use the app-server `externalSandbox` policy because tools execute in Harness, which owns file/network access and approvals. This avoids advertising an unrelated native read-only sandbox as a restriction on Harness writes. Actual Harness denials remain errors and are not bypassed. Auxiliary image/search/fetch backends retain their separate policies.

The adapter capability revision invalidates old provider replay checkpoints once, rebuilding from canonical Harness messages instead of resuming a thread with obsolete instructions. Existing chats are preserved.

Native MCP discovery names are aliased alongside `mcp__` names; otherwise Codex silently drops duplicate dynamic registrations. Native multi-agent and multi-agent v2 are disabled so delegation stays in Harness.

Live probes: `scripts/permission-smoke.mjs`, `scripts/harness-permission-smoke.mjs`, `scripts/resource-tools-smoke.mjs` and `scripts/lifecycle-smoke.mjs`. They require an existing Codex login and consume quota. The Harness permission probe uses only an isolated temporary workspace.
