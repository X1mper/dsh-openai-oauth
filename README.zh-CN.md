# dsh-openai-oauth

[English](README.md) | [Русский](README.ru.md) | 简体中文

通过 ChatGPT 账户在 DeepSeek Harness 中使用 OpenAI 模型。Harness 管理对话并执行工具；OpenAI 官方的本地 Codex app-server 负责登录、凭据保存、令牌刷新和模型访问。无需 OpenAI API Key。

这是一个兼容性修复分支。[上游 PR #3](https://github.com/DGPisces/dsh-openai-oauth/pull/3) 的原始提交保留了作者信息；我们的修改使用独立提交。

## 修复内容

- 设置界面兼容当前 Harness。
- 同时支持新版 Harness 工具结果消息和旧版结果块。
- 将各会话的工作目录传给 Codex，不再始终使用插件进程目录。
- 按钮和次要文字使用 Harness 主题颜色。
- 更新内置 Codex，并通过它获取模型目录。

## 环境要求

- Node.js 22.19 或更高版本。
- DeepSeek Harness 0.2.1-rc.5，本分支针对该版本适配。
- 具有 Codex 访问权限的 ChatGPT 账户。

插件固定使用 Codex 0.166.0。

## 安装此分支

用于 Web 界面：

```sh
dsh plugin --profile web add github:X1mper/dsh-openai-oauth#v0.4.1
```

如果 PATH 中没有 `dsh`，请使用你已安装的 Harness 启动方式。例如：

```sh
npx @deepseek-ai/dsh plugin --profile web add github:X1mper/dsh-openai-oauth#v0.4.1
```

无 Web 界面时，将 `web` profile 替换为 `headless`。各 profile 分别安装依赖。

如果安装方式没有自动注册 bundle，请将 `dsh-openai-oauth` 加入相应 profile 的 `dsh.profile.bundles` 列表，并保留其他条目。安装后重启 Harness。

上游的 `npx dsh-openai-oauth install` 命令安装的是 npm 包，而非此 GitHub 分支。请使用上面的引用或[发行页面](https://github.com/X1mper/dsh-openai-oauth/releases/tag/v0.4.1)中的压缩包。发布到 GitHub 不会自动将插件加入 Harness 插件市场。

## 使用 ChatGPT 登录

启动 Harness Web 界面：

```sh
npx @deepseek-ai/dsh web
```

打开 **Settings → OpenAI OAuth**，点击 **Sign in with ChatGPT**，并在 OpenAI 页面完成授权。随后模型会出现在 Harness 的常规模型选择器中。

对于 headless profile：

```sh
npx @deepseek-ai/dsh plugin --profile headless exec dsh-codex-login
```

凭据单独保存在 `~/.deepseek-harness/codex`，由 Codex 管理。插件不会复制其他 Codex 安装中的登录信息。

## 选择模型

在 Harness 中选择 **OpenAI Codex (ChatGPT OAuth)** 提供方及模型。模型列表来自 Codex，而非插件中的固定列表。模型出现在目录中，并不保证你的账户有权使用它。

`~/.dsh/settings.yaml` 配置示例：

```yaml
agent-default-model:
  provider: openai-codex
  model: gpt-6.1-sol
  reasoningEffort: high
```

请使用你的列表中可用的模型标识符。无 Web 界面的启动方式：

```sh
npx @deepseek-ai/dsh --profile headless "检查这个仓库"
```

## 会话工作目录

创建新的 Codex 对话时，插件从对应 Harness 会话的元数据读取工作目录。不同会话可以使用不同目录。如果没有目录元数据，或调用不属于会话，则使用插件进程目录。

**更新后请新建 Harness 会话：** 已有的 Codex 对话保留原来的目录。

## 工具权限

Harness 控制其动态工具的文件访问和审批。Codex 环境工具通过 `environments: []` 禁用，其自身沙箱保持只读。这些 Codex 限制不会取代 Harness 对自身执行工具的权限策略。

适配器向模型传递真实的工具结果，包括权限拒绝。Harness 的拒绝不会被转换为成功。

## 卸载

从相应 profile 中移除包：

```sh
dsh plugin --profile web remove dsh-openai-oauth
```

如果 bundle 列表中仍有 `dsh-openai-oauth`，请移除该条目并重启 Harness。其他安装过此插件的 profile 也需要分别处理。移除包不会删除保存的 ChatGPT 登录；如有需要，请先在插件设置中点击 **Sign out**。

## 本地开发

```sh
npm install --legacy-peer-deps
npm run build
npm pack --dry-run
```

`DSH_CODEX_CLI` 可指定 Codex JavaScript 入口文件的路径。默认使用插件固定版本的依赖。

这是独立的社区插件，并非 DeepSeek 或 OpenAI 官方产品。

## 许可证

MIT
