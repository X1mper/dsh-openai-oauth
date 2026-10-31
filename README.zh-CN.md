![Codex, meet Harness. 使用 ChatGPT 账户连接模型、搜索和图片能力。](assets/readme-hero.svg)

<div align="center">

# 在 DeepSeek Harness 中使用 Codex

**用你的 ChatGPT 账户，写代码、查资料、做创作。**<br>
对话、工具和权限仍由 Harness 管理。

[![Release](https://img.shields.io/badge/release-v0.6.0-bba7ff?style=flat-square&labelColor=202736)](https://github.com/X1mper/dsh-openai-oauth/releases/tag/v0.6.0) [![Harness](https://img.shields.io/badge/tested_with-Harness_0.2.1--rc.5-b6f38b?style=flat-square&labelColor=202736)](#compatibility) [![Node.js](https://img.shields.io/badge/node-%E2%89%A522.19-8bd5ca?style=flat-square&labelColor=202736)](#compatibility) [![License](https://img.shields.io/badge/license-MIT-e9c98b?style=flat-square&labelColor=202736)](LICENSE)

[English](README.md) · [Русский](README.ru.md) · **简体中文**

[快速开始](#start) · [网页与图片](#tools) · [技术参考](guides/REFERENCE.zh-CN.md) · [发行说明](https://github.com/X1mper/dsh-openai-oauth/releases/tag/v0.6.0)

**0.6.0：原生 Harness 上下文处理、七个独立组件与空闲压缩设置。** 请参阅[集成指南](guides/NATIVE-PROVIDER.md)。

</div>

[原生提供程序、独立组件与空闲压缩](guides/NATIVE-PROVIDER.md)。

**从 0.5.x 升级后请重启 Harness**，让旧版整体插件释放注册项，再启用独立组件。

---

## 给创作多一点空间

`dsh-openai-oauth` 将 Harness 连接到官方本地 **Codex app-server**。通过 ChatGPT 登录、选择模型，然后继续在熟悉的 Harness 界面中工作。无需 OpenAI API Key。

| | 你会获得 |
| :-- | :-- |
| 🧠 **Codex 模型** | 从 Codex 获取最新模型目录，由它处理 ChatGPT 登录和令牌刷新。 |
| 🔎 **内置网页能力** | 通过标准 Harness 工具进行原生搜索和页面读取，保留来源链接。 |
| 🎨 **看图，也能创作** | 读取附件和 MCP 截图，生成新图片，或根据 1–4 张参考图编辑。 |
| 🧵 **继续原来的对话** | 恢复匹配的已完成线程，接收新指令时无需反复重建整个对话。 |
| 📊 **看得见的用量** | 在界面中查看真实令牌统计和服务端报告的 ChatGPT 配额窗口。 |
| 🛠️ **保留 Harness 工具** | 工具执行、文件访问和审批继续由 Harness 控制。 |

<a id="start"></a>

## 开始使用

### 1 · 安装

```sh
dsh plugin --profile web add github:X1mper/dsh-openai-oauth#v0.6.0
```

安装后重启 Harness。需要压缩包？[发行页面](https://github.com/X1mper/dsh-openai-oauth/releases/tag/v0.6.0)提供已编译的 `.tgz`。

<details>
<summary>没有 <code>dsh</code> 命令，或使用 headless？</summary>

使用你已安装的 Harness 启动器。例如：

```sh
npx @deepseek-ai/dsh plugin --profile web add github:X1mper/dsh-openai-oauth#v0.6.0
```

无界面使用时将 `web` 替换为 `headless`。各 profile 独立安装依赖。如果安装器未自动注册 bundle，请将 `dsh-openai-oauth` 加入该 profile 现有的 `dsh.profile.bundles` 列表。

上游的 `npx dsh-openai-oauth install` 安装的是上游 npm 包，不是这个分支。请使用上面的 GitHub 引用。

</details>

### 2 · 使用 ChatGPT 登录

打开 **Settings → OpenAI · Codex → Sign in with ChatGPT**，在 OpenAI 页面完成授权。

### 3 · 选择模型

在 Harness 模型选择器中选择 **OpenAI Codex (ChatGPT OAuth)**，再选择你的账户可用的模型。模型目录来自 Codex，而非插件内的固定列表。

<details>
<summary>Headless 登录与首次运行</summary>

```sh
npx @deepseek-ai/dsh plugin --profile headless exec dsh-codex-login
npx @deepseek-ai/dsh --profile headless "分析这个代码仓库"
```

在 profile 配置中选择提供方和模型。[配置示例 →](guides/REFERENCE.zh-CN.md#选择模型)

</details>

<a id="tools"></a>

## 交给它一个任务

### 🔎 找到资料，打开页面，查看来源

> 找到这个库的官方文档，打开相关页面，解释发生了哪些变化。

在 `~/.dsh/profiles/web/cordis.patch.yml` 中启用 Codex 搜索和页面读取：

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

如果使用 `headless`，也在它的 patch 中添加这些配置。明确选择两个提供方可避免 “multiple usable web providers” 错误。这些 Codex 工具无需 DeepSeek API Key。

### 🎨 从一句话，或一张图开始

> 画一个方形头像：小宇航员在月球上种植一株植物。

> 保留这张图中的角色，将背景改成雨中的城市，并保持构图。

模型通过 `image_generate` 生成图片，通过 `image_edit` 编辑会话中的参考图。本地文件先用 `read_image` 读取。结果保存为新的 PNG 附件，原图保持不变。

工具返回经过验证的文件路径，方便模型在最终回复中直接展示图片，并在 `present` 可用时添加文件卡片。无需额外 imagegen 技能或 API Key 配置。

<a id="compatibility"></a>

## 使用前了解这些

- **验证环境：** Harness `0.2.1-rc.5`、Node.js `22.19+`；内置 Codex 固定为 `0.166.0`。
- **账户访问：** 需要拥有 Codex 权限的 ChatGPT 账户。模型、图片生成能力和配额取决于账户。
- **页面读取：** 返回提取的文字，不是原始 HTML。HTTP `0` 表示状态码未知。普通 HTTP 获取可使用 `fetchProvider: http`。
- **上下文：** 已修复新消息引发反复压缩的问题。`/compact` 仍使用 Harness 摘要；恢复不是无损重放。
- **登录信息：** 由 Codex 独立管理，保存在 `~/.deepseek-harness/codex`，不会复制另一套 Codex 安装的登录状态。

## 工作原理

```text
Harness 对话与工具
        │
   dsh-openai-oauth
        │
 本地 Codex app-server
        │
   ChatGPT 账户
```

**v0.6.0** 通过 135 项自动测试，以及已安装 Harness 的压缩和组件生命周期检查。真实 Codex 测试验证大段历史摘要和后续对话。

[配置、权限与恢复](guides/REFERENCE.zh-CN.md) · [开发与检查](guides/REFERENCE.zh-CN.md#本地开发) · [卸载](guides/REFERENCE.zh-CN.md#卸载)

## 来源与致谢

基于 [DGPisces/dsh-openai-oauth](https://github.com/DGPisces/dsh-openai-oauth)。本分支持续适配当前 Harness，并添加上述集成功能。[上游 PR #3](https://github.com/DGPisces/dsh-openai-oauth/pull/3) 中的原始提交保留作者信息。

独立社区项目，并非 OpenAI 或 DeepSeek 官方产品。[MIT 许可证](LICENSE)。
