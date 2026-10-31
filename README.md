# dsh-openai-oauth

English | [Русский](README.ru.md) | [简体中文](README.zh-CN.md)

Use OpenAI models with your ChatGPT account in DeepSeek Harness. Harness manages the conversation and executes tools; the official local Codex app-server handles sign-in, credential storage, token refresh, and model access. No OpenAI API key is required.

This fork was created to support current Harness and make fixes available while they remain unmerged upstream. The original commits from [upstream PR #3](https://github.com/DGPisces/dsh-openai-oauth/pull/3) retain their authorship; our changes are separate commits.

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
dsh plugin --profile web add github:X1mper/dsh-openai-oauth#v0.4.1
```

If `dsh` is not on PATH, use your installed Harness launcher. For example:

```sh
npx @deepseek-ai/dsh plugin --profile web add github:X1mper/dsh-openai-oauth#v0.4.1
```

For headless use, replace the `web` profile with `headless`. Each profile installs its own dependencies.

If your installation method does not register the bundle automatically, add `dsh-openai-oauth` to that profile's `dsh.profile.bundles` list, keeping its other entries. Restart Harness after installation.

The upstream `npx dsh-openai-oauth install` command installs the npm package, not this GitHub fork. Use the reference above or the archive on the [release page](https://github.com/X1mper/dsh-openai-oauth/releases/tag/v0.4.1). GitHub publication does not automatically list the plugin in the Harness marketplace.

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
