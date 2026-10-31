# Native provider integration · 0.6.1

This describes the 0.6.1 release. Restart Harness after upgrading from 0.5.x: the old monolithic plugin must release its registrations before the independent components start.
The integration targets Harness 0.2.1-rc.5 and Codex app-server 0.166.0.

## Components

Open **Settings → OpenAI · Codex → Manage components** to reach Harness's
plugin controls. The bundle contains independently managed entries:

| Entry | Responsibility |
| --- | --- |
| `codex-runtime` | Shared app-server process and lifecycle |
| `llm-codex-app-server` | `openai-codex` model provider |
| `codex-web-search` | Codex-backed search |
| `codex-web-fetch` | Codex-backed page reading |
| `codex-images` | Image generation and editing tools |
| `codex-account` | Account, login and limits HTTP endpoints |
| `codex-context-policy` | Idle-session compaction policy |

Search can be disabled without disabling the model provider or page reading.
The shared runtime is a dependency of the Codex-backed services; disabling it
also makes its dependents unavailable. Context policy requires the native agent
and token meter services, and uses the active agent's compaction backend.

## History belongs to Harness

The adapter registers through `llm.registerAdapter`. Requests pass through the
normal `llm/stream` middleware and native file, model-modality and tool-history
projections. Harness executes tools and enforces permissions. Codex's built-in
tools do not replace Harness tools.

Canonical session messages determine whether a provider thread can be reused.
Changed context, tools or instructions can require rebuilding it. Provider replay
state uses the native response envelope; old saved adapter state remains readable.
Normal requests never silently summarize their own history. Transport overflow
and provider context errors return `CONTEXT_WINDOW_EXCEEDED` so Harness can run
its installed compaction backend and retry against the resulting canonical history.
Auxiliary summarization requests retain bounded chunking for exceptionally large
inputs. The normal transport input guard uses 1,000,000 UTF-16 code units,
leaving headroom below Codex's transport ceiling. The 200,000-character auxiliary
summary budget is separate from both this guard and the model's token context
window. After cancellation, the adapter rebuilds the exact canonical history in
a new thread; cancellation alone does not trigger summarization.

## Idle policy

The native settings form saves live values through Harness's configuration forms:

- `idleMinutes`: **30** by default; `0` disables idle compaction.
- `minHistoryTokens`: **16,000** by default; smaller histories are skipped.

The check runs before continuing a conversation, not as a background timer.
It only applies to `openai-codex`, checks the last completed turn and calls the
agent's compaction backend. It attempts at most once per turn. A durable summary
prevents another idle compact after a plugin restart in that same turn. Missing
backends and short histories are skipped. Failure preserves the canonical history;
cancellation propagates. Normal pressure-based and manual compaction remain owned
by Harness.

## Cache is not session retention or a free-use window

OpenAI's [prompt caching documentation](https://developers.openai.com/api/docs/guides/prompt-caching)
describes model-dependent API cache lifetimes, including a 30-minute default for
newer Responses models and longer retention options. Those API rules do not
establish a guaranteed retention period or a free-to-paid boundary for ChatGPT
OAuth use through Codex. A persisted thread can outlive its cached prompt.

The 30-minute setting is a configurable history-size policy, not a billing promise.
Compaction itself makes a model request, consumes usage and may discard details.
Shorter context can reduce future input, but no fixed savings are guaranteed.

## Verification

`npm test` covers adapter replay, dynamic tools, schemas, image references,
cancellation, model metadata, usage, failure classification and configuration.
`tests/native-runtime.test.mjs` uses the real Harness LLM runtime to exercise
middleware, projections, registration disposal and terminal context errors.

Run the real compaction-engine smoke against an installed Harness runtime:

```sh
DSH_RUNTIME_ROOT=/path/to/node_modules/@deepseek-ai node scripts/harness-compaction-smoke.mjs
DSH_RUNTIME_ROOT=/path/to/node_modules/@deepseek-ai node scripts/harness-components-smoke.mjs
```

It checks manual and pressure compaction, idle policy, overflow recovery, durable
restore/continue, repeated-compaction prevention and preservation of history on
empty, oversized, interrupted or failed summaries. Its provider transport is
deterministic. It also runs the installed tool-result pruner and image-offload
plugin against real sessions: the adapter receives pruned text and image omission
placeholders, and replay retains both decisions. This does not prove every
third-party context plugin compatible.

The component smoke uses actual LLM, web and tool registries. It checks that
search and image tools unregister independently, component restarts do not
duplicate registrations, and stopping/restarting the shared runtime removes and
restores the dependent components.
Live provider checks are available in `scripts/history-smoke.mjs` and
`scripts/harness-web-fetch-smoke.mjs` and require an existing Codex login.

## Acceptance checks (2026-10-31)

| Requirement | Evidence |
| --- | --- |
| Native provider boundary | Real `LlmRuntime` middleware, model resolution, file/modality projections and terminal error tests |
| Context plugins remain effective | Installed tool-result pruner and image-offload plugin exercised on real `Session` instances, including durable replay |
| Native compaction | Installed `BasicCompactionEngine` manual, pressure, overflow and idle paths; failed summaries preserve history |
| No cyclic idle compaction | Once-per-turn guard, durable summary check and repeated-step integration test |
| Independent components | Actual LLM/web/tool registries: search and images off/on, component restart, shared-runtime stop/resume |
| Settings UI | Browser check of native form save, reload, default reset and navigation to native component switches |
| Default 30-minute policy | Schema, live configuration and boundary tests; small histories and other providers skipped |
| Codex continuation | Live `gpt-6.1-sol` test preserved an exact marker through large-history auxiliary summarization and continuation |
| Packaging | Dry-run package contains all seven component entry points and compiled client; declared Harness minimum is 0.2.1-rc.5 |

The unit/integration suite contains 136 passing tests. Additional engine and
component smoke scripts pass against Harness 0.2.1-rc.5. These checks use an
isolated profile. Arbitrary third-party plugins and future host versions are
outside the verified compatibility matrix.
