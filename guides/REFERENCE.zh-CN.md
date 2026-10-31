# 配置与技术参考

[← 返回项目概览](../README.zh-CN.md)

v0.5.0 的模型选择、会话恢复、用量统计、工具边界与开发检查。

## 选择模型

在 Harness 中选择 **OpenAI Codex (ChatGPT OAuth)** 提供方及模型。模型列表来自 Codex，而非插件中的固定列表。模型出现在目录中，并不保证你的账户有权使用它。

`~/.dsh/profiles/web/cordis.patch.yml` 配置示例：

```yaml
- id: agent-default-model
  config:
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

## ChatGPT 配额百分比

输入框下方的原生步数/用量统计旁显示真实配额，每个服务器提供的时间窗口单独一行。显示已使用百分比和实际窗口时长，提示中显示重置时间。可见页面每 30 秒通过 Codex `account/rateLimits/read` 刷新一次。不会虚构缺失窗口，无法获取时明确显示不可用。账户配额与 token 统计分开，支持英文、俄文和中文。

## Token 用量

适配器将 Codex 的 `thread/tokenUsage/updated` 计数传给 Harness。详细性能模式下，原生 token 用量指示器显示在轮数/步数旁；点击可查看未缓存输入、缓存读写和输出。紧凑模式显示缓存命中率。推理 token 已包含在输出中，不会重复相加。

Codex 线程的累计值转换为每次 Harness 调用的增量，包括动态工具暂停，因此重复通知不会重复计费。缺失、无效或倒退的计数不会被估算；旧版本遗漏的用量不会补算。这是 token 统计，不是 ChatGPT 订阅额度或美元费用。更新正在使用的提供方后，需要重启 Harness。

使用已安装 Harness 的离线集成检查（无需凭据或模型调用）：

```sh
DSH_RUNTIME_ROOT=/path/to/node_modules/@deepseek-ai node scripts/harness-usage-smoke.mjs
```

## 工具权限

Harness 控制其动态工具的文件访问和审批。Codex 环境工具通过 `environments: []` 禁用，其自身沙箱保持只读。这些 Codex 限制不会取代 Harness 对自身执行工具的权限策略。

适配器向模型传递真实的工具结果，包括权限拒绝。Harness 的拒绝不会被转换为成功。

## 上下文恢复与压缩

Harness 当前历史是唯一事实来源。重启/HMR 后，适配器核对历史指纹、助手输出、会话配置及最后保存的 turn，仅恢复匹配且已完成的 Codex 线程。用量从保存的累计计数继续计算。旧版、不匹配或未完成的检查点仍从当前历史重建，不会重新执行历史工具调用。历史变化时，在没有待处理工具响应的情况下重建对话；系统提示、模型或工具变化时，即使正在等待工具响应也会重建。

`/compact` 与会话标题在独立的临时纯文本线程运行，不提供工具。辅助调用的 `maxTokens` 仅是软性提示，不是服务器强制上限；普通请求仍拒绝显式 maxTokens、temperature 和 stop。压缩后的历史用于后续主对话。

超过 200,000 个 UTF-16 字符的输入会先分块压缩：每个旧片段最多 120,000 字符，在无工具的独立线程中摘要，最近 60,000 字符保持原文，必要时进行多层摘要。这是明确标记的语义恢复，并非无损重放；Harness 原始日志不变。空摘要、超长摘要或取消会明确失败，不会静默截断。Codex 校验所有文本输入的总长度，单纯拆分数组不能绕过限制。内部摘要的真实 token 用量计入 usage；大历史恢复需要时间，重启后可能再次压缩。发送失败或取消会清除适配器状态以安全重试；临时线程会释放。工具暂停期间切换模型、系统提示或工具时，会从当前历史重建线程。

工具暂停期间的新文本指令和子代理消息先通过 `turn/steer` 传入，再返回工具结果，保留线程而不重复摘要。steer 失败会明确报错；实际历史替换仍会重建。对于 `willRetry` 错误，适配器等待 Codex 自身重试结果。历史中的助手输出会与此前生成结果核对。Codex 进程退出后，队列的当前和后续读取都会明确失败，旧工具事件不会被误当作成功的工具边界。

点击配额行查看已用/剩余百分比、窗口时长、重置日期与倒计时、获取时间和刷新按钮。配额不是令牌计数，不会虚构未报告的窗口。

## Codex 原生网页搜索

插件向 Harness 标准 `web` 服务注册 `openai-codex` 搜索提供方，通过 ChatGPT 登录在独立临时线程中运行 Codex 原生实时搜索，无需 DeepSeek API 密钥。标准 `web_search` 工具保留来源卡片、持久化来源元数据和 Markdown 引用。

在配置补丁中明确选择：

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

注册本身不切换现有提供方。内置 DeepSeek 搜索设置开关仍选择 DeepSeek 后端，可能覆盖此选择。搜索使用 ChatGPT 配额，用量记录在 `web/codex-search-llm-request` 事件中；未实际执行原生搜索的响应会被拒绝。取消操作中断并释放临时线程，普通对话、标题和压缩线程仍禁用原生搜索。

提供方还通过 Codex 原生 `openPage` 支持 `web_fetch`，返回模型提取的文字而非原始 HTML，不保证完整或逐字一致。app-server 不提供 HTTP 状态码，`0` 明确表示未知。未经确认打开请求 URL 并获得可读结果的响应会被拒绝。用量记录为 `web/codex-fetch-llm-request`。如需普通 HTTP 传输，可使用 `fetchProvider: http`。

## 图片

用户附件和 MCP 工具返回的图片通过 Harness 附件存储以原生图片传入 Codex，支持 PNG、JPEG、WebP、GIF 以及文字与图片混合结果。恢复历史时标记图片来源并跳过已卸载的图片；图片字节不进入文本摘要。

实时验证：`DSH_CLI=/path/to/dsh/lib/bin.js node scripts/harness-images-smoke.mjs /absolute/screenshot.png "visible text"`。

## 图片生成与编辑

`image_generate` 使用当前 ChatGPT 登录调用 Codex 原生图片生成；`image_edit` 接收提示词和当前会话中 1–4 个有效附件的 `image_ids`。本地图片先通过 `read_image` 导入。输入以原生图片直接传入独立调用，通过 `num_last_images_to_include` 编辑，无需访问本地路径，原附件不被覆盖。结果作为新的 PNG 附件持久保存。

可选参数 `transparent_background` 控制透明背景；编辑未指定时要求保留原透明度。调用运行于独立临时线程，禁用 shell、网页和动态工具，取消时中断，超时为五分钟，且不创建临时输入文件。能力通过 `modelProvider/capabilities/read` 检查，用量记录为 `image/codex-llm-request`。仅返回文件标识而无内联图片字节的响应会明确失败。

工具还会返回已验证的 `path`：文件必须位于 Codex 图片输出目录且字节与本次结果一致。模型应在同一轮最终回复中使用 `![描述](<path>)`，并在 `present` 可用时附上文件卡片。`attachmentId` 仅用于后续编辑，不是文件路径；无需搜索私有目录、计算哈希寻找文件、重新生成或加载单独的 `imagegen` 技能。

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
