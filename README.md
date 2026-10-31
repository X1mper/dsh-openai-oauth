# dsh-openai-oauth

English | [Русский](README.ru.md) | [简体中文](README.zh-CN.md)

Connect DeepSeek Harness to Codex with your ChatGPT account: model access, native web search and page reading, image understanding, generation and editing, conversation recovery, and token/quota tracking. Harness manages conversations and tool permissions; the official local Codex app-server handles sign-in, credential storage, token refresh, and native capabilities. No OpenAI API key is required.

This fork was created to support current Harness and make fixes available while they remain unmerged upstream. The original commits from [upstream PR #3](https://github.com/DGPisces/dsh-openai-oauth/pull/3) retain their authorship; our changes are separate commits.

## What is new in 0.5

- Native Codex search and page reading through standard Harness web tools.
- User images and MCP screenshots, plus image generation/editing with immediate delivery.
- Persistent conversation recovery and steering without repeated compaction on incoming messages.
- Reserved MCP tool-name aliases and coordinate-schema compatibility.
- Real token usage and ChatGPT quota windows in the UI.

## Fixes

- Settings UI compatibility with current Harness.
- Support for current Harness tool-result messages alongside legacy result blocks.
- Each session's working directory is passed to Codex instead of always using the plugin process directory.
- Buttons and secondary text use Harness theme colors.
- Updated bundled Codex and model discovery through it.

## Requirements

- Node.js 22.19 or newer.
- DeepSeek Harness 0.2.1-rc.5, the version this fork targets.
- A ChatGPT account with Codex access.

The plugin pins Codex to version 0.166.0.

## Install the fork

For the web interface:

```sh
dsh plugin --profile web add github:X1mper/dsh-openai-oauth#v0.5.0
```

If `dsh` is not on PATH, use your installed Harness launcher. For example:

```sh
npx @deepseek-ai/dsh plugin --profile web add github:X1mper/dsh-openai-oauth#v0.5.0
```

For headless use, replace the `web` profile with `headless`. Each profile installs its own dependencies.

If your installation method does not register the bundle automatically, add `dsh-openai-oauth` to that profile's `dsh.profile.bundles` list, keeping its other entries. Restart Harness after installation.

The upstream `npx dsh-openai-oauth install` command installs the npm package, not this GitHub fork. Use the reference above or the archive on the [release page](https://github.com/X1mper/dsh-openai-oauth/releases/tag/v0.5.0). GitHub publication does not automatically list the plugin in the Harness marketplace.

## Sign in with ChatGPT

Start the Harness web interface:

```sh
npx @deepseek-ai/dsh web
```

Open **Settings → OpenAI OAuth**, select **Sign in with ChatGPT**, and complete authorization on the OpenAI page. Models will then appear in the normal Harness model picker.

For a headless profile:

```sh
npx @deepseek-ai/dsh plugin --profile headless exec dsh-codex-login
```

Credentials are stored separately under `~/.deepseek-harness/codex` and managed by Codex. The plugin does not copy authentication from another Codex installation.

## Select a model

Choose **OpenAI Codex (ChatGPT OAuth)** and a model in Harness. The model list comes from Codex rather than being hardcoded in the plugin. A model appearing in the catalog does not by itself guarantee access for your account.

Example configuration in `~/.dsh/settings.yaml`:

```yaml
agent-default-model:
  provider: openai-codex
  model: gpt-6.1-sol
  reasoningEffort: high
```

Use a model identifier available in your list. To run without the web interface:

```sh
npx @deepseek-ai/dsh --profile headless "inspect this repository"
```

## Session working directory

When creating a new Codex thread, the plugin reads the working directory from the corresponding Harness session's metadata. Different sessions can use different directories. If directory metadata is missing or the call is outside a session, the plugin process directory is used.

**Start a new Harness session after updating:** existing Codex threads keep their original directory.

## ChatGPT quota limits

Provider-reported quota percentages appear next to the native steps/usage statistics below the composer, one line per reported window. Labels show **used** percent and the actual window duration; reset time is in the tooltip. The local Codex `account/rateLimits/read` API is refreshed every 30 seconds while the page is visible. Missing windows are not invented; unavailable data is shown explicitly. These are account limits, separate from token totals. English, Russian and Chinese labels follow the Harness locale.

## Token usage

The adapter forwards Codex's `thread/tokenUsage/updated` counters to Harness. In Detailed performance mode, the native token-usage pill appears beside the turns/steps counter; click it for uncached input, cache reads/writes and output. Compact mode shows the cache-hit percentage instead. Reasoning tokens remain part of output, not an extra charge added to it.

Cumulative Codex thread totals are converted to per-Harness-call deltas, including dynamic-tool pauses, so repeated notifications do not double-count. Missing, malformed or regressing usage is not estimated. Usage previously omitted by older plugin versions is not backfilled. This is token accounting, not ChatGPT subscription quota or dollar pricing. Restart Harness after updating the active provider.

Offline integration with an installed Harness (no credentials or model calls):

```sh
DSH_RUNTIME_ROOT=/path/to/node_modules/@deepseek-ai node scripts/harness-usage-smoke.mjs
```

## Tool permissions

Harness controls file access and approvals for its dynamic tools. Codex environment tools are disabled through `environments: []`, and its own sandbox remains read-only. These Codex restrictions do not replace Harness policy for tools executed by Harness.

The adapter passes actual tool results to the model, including permission denials. A Harness denial is not converted into success.

## Uninstall

Remove the package from the appropriate profile:

```sh
dsh plugin --profile web remove dsh-openai-oauth
```

Remove `dsh-openai-oauth` from that profile's bundle list if the entry remains, then restart Harness. Repeat for other profiles where you installed the plugin. Removing the package does not delete the saved ChatGPT login; if needed, use **Sign out** in the plugin settings first.

## Development

```sh
npm install --legacy-peer-deps
npm run build
npm pack --dry-run
```

`DSH_CODEX_CLI` can specify an explicit path to the Codex JavaScript entry point. By default, the plugin uses its pinned dependency.

This is an independent community plugin, not an official DeepSeek or OpenAI product.

## License

MIT

### Context recovery and compaction (0.5)

Harness history is authoritative. After restart/HMR the adapter resumes a completed Codex thread only when its saved history fingerprint, assistant output, session/configuration and latest persisted turn all match. Usage resumes from the saved cumulative counters. Old, incompatible or unfinished checkpoints fall back to rebuilding from the current transcript (including tool results and checkpoints). Changed history also rebuilds the conversation when no tool response is pending; model/system/tool changes rebuild even during a tool pause. This recovery uses a role-labelled textual transcript, not native historical tool execution.

`/compact` and session-title calls run in separate ephemeral, text-only threads with no tools. Their `maxTokens` is a **soft instruction**, not a hard server-enforced completion cap (Codex app-server exposes no such per-turn control). Ordinary explicit `maxTokens`, temperature and stop controls still reject. The compacted Harness history is used on the next conversational request.

Inputs above 200,000 UTF-16 characters are reduced through isolated, tool-free summaries of every older fragment (120,000 characters per chunk), with the latest 60,000 characters retained verbatim. Reduction may be hierarchical. This is explicitly labelled semantic recovery, not lossless replay; the durable Harness log remains unchanged. Empty/oversized summaries and cancellation fail explicitly instead of silently truncating. Codex validates the sum of input text parts, so array splitting alone cannot bypass its limit. Internal summaries consume real tokens, included in usage, and can take time; a restart can require summarizing again. Failed sends and cancelled turns invalidate adapter state before retry; temporary threads are released. Model/system/tool changes during a tool pause rebuild from canonical history rather than resuming an incompatible turn.

New text instructions, including agent inbox messages, are delivered with `turn/steer` before pending tool results are returned. They keep the existing thread and do not re-summarize old history. A rejected steer fails explicitly; actual history replacement still rebuilds. Retryable Codex errors wait for Codex to finish its own retry. Changed canonical assistant output is checked against previously emitted output. Process-death queues reject both existing and future reads and discard stale tool events; non-timeout transport failures are not treated as successful tool boundaries.

Opt-in live check using your existing ChatGPT login:

```sh
DSH_HISTORY_SMOKE_MODEL=gpt-6.1-sol node scripts/history-smoke.mjs
node scripts/lifecycle-smoke.mjs
```

Click a quota line to expand used/remaining percentages, reported window duration, reset date/countdown, fetch time and manual refresh. Quotas are not token totals; absent windows are never invented.

### Native Codex web search (0.5)

The plugin registers an `openai-codex` search provider with Harness's standard `web` service. It uses ChatGPT sign-in and Codex native live web search in an isolated ephemeral thread. No DeepSeek API key is needed. The regular Harness `web_search` tool retains its source cards, persisted source metadata and Markdown citations. The current Codex conversation model is used, or the Codex catalog default outside a Codex conversation.

Select the provider explicitly in your profile patch:

```yaml
- id: web
  config:
    searchProvider: openai-codex
    fetchProvider: openai-codex
- id: tool-web
  config:
    searchTimeoutMs: 120000
    fetchTimeoutMs: 120000
```

Registration alone does not change the existing search provider. The bundled DeepSeek search settings switch still selects DeepSeek backends; changing it can replace the selection above. Searches consume ChatGPT quota and record model/token usage in `web/codex-search-llm-request` session events. Responses without an observed native search fail explicitly. Titles and snippets are generated from search results; URLs are normalized and deduplicated, with no invented publication dates. Cancellation interrupts and releases the auxiliary thread. Ordinary conversation, title and compaction threads keep native search disabled.

Opt-in live checks: `node scripts/web-search-smoke.mjs` and `DSH_CLI=/path/to/dsh/lib/bin.js node scripts/harness-web-search-smoke.mjs`.

### Images (0.5)

User attachments and MCP tool images are passed to Codex as native images through Harness attachment storage. PNG, JPEG, WebP and GIF are supported, including mixed text/image results. History recovery labels images by their original messages and skips offloaded images. Image bytes are kept out of textual summaries.

Opt-in live check: `DSH_CLI=/path/to/dsh/lib/bin.js node scripts/harness-images-smoke.mjs /absolute/screenshot.png "visible text"`. This checks the full MCP → Harness attachment → Codex vision path.

The provider also supports `web_fetch` through native Codex `openPage`. It returns model-extracted text, not raw HTML; completeness and verbatim fidelity are not guaranteed. App-server does not expose HTTP status: `0` explicitly means unknown and is explained in the result. Responses without a confirmed open of the requested URL and readable native results are rejected. Usage is recorded in `web/codex-fetch-llm-request`. Keep `fetchProvider: http` for ordinary HTTP transport. Live check: `DSH_CLI=/path/to/dsh/lib/bin.js node scripts/harness-web-fetch-smoke.mjs`.

### Image generation and editing (0.5)

`image_generate` creates one image with native Codex image generation using the existing ChatGPT login. `image_edit` accepts a prompt and 1–4 `image_ids` from active image attachments in the current conversation. Use Harness `read_image` first for local files. Inputs are sent as native images directly in the isolated turn; the generator edits them with `num_last_images_to_include` without local path access. Original attachments remain unchanged.

Both tools return a new durable PNG image attachment. Optional `transparent_background` requests transparency; edits otherwise instruct the model to preserve existing transparency. Generation runs in an isolated ephemeral thread without shell, web or dynamic tools. No temporary input files are created. Cancellation interrupts the thread, and calls have a five-minute timeout. Native image generation stays disabled in ordinary conversation threads.

Availability is checked with `modelProvider/capabilities/read`. Generation consumes ChatGPT quota; observed token usage is recorded in `image/codex-llm-request`, not treated as an image-quota counter. The pinned CLI returns PNG bytes in `result`; file-only responses without inline bytes fail explicitly.

Full generation/edit live check: `DSH_CLI=/path/to/dsh/lib/bin.js node scripts/harness-image-generation-smoke.mjs`.

Tools also return `path` when the native output is inside the Codex generated-image directory and its file bytes match this generation. Use that exact path in `![description](<path>)` in the same final response, and call `present` when available for a downloadable card. Keep `attachmentId` for later edits; it is not a path. No private-directory searches, hash hunting, regeneration for display, or separate `imagegen` skill are needed. Delivery smoke check: `DSH_CLI=/path/to/dsh/lib/bin.js node scripts/harness-image-delivery-smoke.mjs`.
