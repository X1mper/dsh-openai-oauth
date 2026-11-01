# Codex context indicator and pressure backend (0.6.3)

## No host patches

This release uses public plugin services and slots. It does not patch Harness files, replace its built-in context meter, or change historical billing. Cumulative usage remains billing; validated latest-request `contextUsage` is a separate occupancy sample.

## Indicator

The bundle registers `dsh-openai-oauth/context-indicator`. A custom session projection travels through Harness's existing session transport; there is no new HTTP endpoint or polling. It retains only numeric surface-node prices and route metadata, not conversation text or a duplicate log.

The composer shows **Codex context** only when the effective selection is `openai-codex`. Pending model changes suppress the previous route's values. Capacity must match the same durable provider/model; no model window is hardcoded.

The displayed approximate total uses the last valid request sample plus estimated subsequent growth, or fixed-density surface/tool estimates after replacement. It is neither billing nor ChatGPT quota. The tooltip explains that hidden provider/image overhead and in-flight output may be missing. Offload invalidates stale fallback values: unavailable is preferable to a made-up number. The native Harness meter remains separately visible and may still count aggregate usage differently.

## Compaction activation (explicit)

Installing the release enables the indicator, **not** automatic backend replacement. In the existing isolated compaction group, replace ONLY the module name of the existing entry:

```yaml
- id: compaction-basic
  name: dsh-openai-oauth/compaction
  # preserve your existing config
```

Keep its id, scope and configuration. Keep `auto:true` (the default). Do not install a second engine. This module subclasses BasicCompactionEngine and uses its public region transaction. The rc.5 type contract explicitly dispatches automatic compaction through overrides of `compactIfNeeded`; broader docs describe `summarize` as the primary extension hook, so compatibility is pinned and tested against **0.2.1-rc.5**, not promised for arbitrary future releases.

Native manual compaction and provider-confirmed overflow recovery remain unchanged. Non-Codex pressure delegates to Basic. During a model switch involving Codex, proactive work waits for the durable header to match the assembled route rather than summarize under the previous provider. This capture supports stock Harness model selection, not arbitrary late routing middleware.

Pressure never re-summarizes a selected span containing only a checkpoint, even when new work is in the retained tail. New content within the selected span permits legitimate further compaction. Provider-confirmed overflow can still force native reduction.

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
