window.__ModuleLoader__.load({
	id: "dsh-openai-oauth",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		// src/context-settings.tsx
		function ContextSettings({ scope, ru }) {
			const form = (0, react.useMemo)(() => new _deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(scope, [(0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("idleMinutes"), (0, _deepseek_ai_dsh_client_ui_primitives.settingsNumberField)("minHistoryTokens")]), [scope]);
			const store = (0, react.useMemo)(() => form.bind(() => ({
				...form.shell(),
				idleMinutes: form.field("idleMinutes"),
				minHistoryTokens: form.field("minHistoryTokens")
			})), [form]);
			const state = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			(0, react.useEffect)(() => () => form.dispose(), [form]);
			const actions = form.actions();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsForm, {
				state,
				onSave: actions.save,
				onDiscard: actions.discard,
				labels: {
					unavailable: ru ? "Компонент политики контекста недоступен." : "Context policy component is unavailable.",
					readOnly: ru ? "Настройки доступны только для чтения." : "Settings are read-only.",
					saveFailed: ru ? "Настройки не сохранены. Проверь значения и повтори." : "Settings were not saved. Check the values and retry.",
					save: ru ? "Сохранить" : "Save",
					saving: ru ? "Сохранение…" : "Saving…"
				},
				children: ["idleMinutes", "minHistoryTokens"].map((field) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
					id: `codex-${field}`,
					numeric: true,
					disabled: !state.writable,
					label: field === "idleMinutes" ? ru ? "Сжимать после простоя, минут" : "Compact after idle minutes" : ru ? "Минимальный объём истории, токенов" : "Minimum history tokens",
					hint: field === "idleMinutes" ? ru ? "По умолчанию 30 минут. 0 отключает сжатие по времени. Проверяется перед продолжением диалога." : "Default: 30 minutes. 0 disables idle compaction. Checked before continuing a conversation." : ru ? "Короткие диалоги не сжимаются. Это оценка объёма, а не счёт за использование." : "Short conversations are skipped. This is a size estimate, not a usage bill.",
					overriddenLabel: ru ? "Изменено" : "Overridden",
					resetLabel: ru ? "По умолчанию" : "Reset to default",
					invalidLabel: ru ? "Введи число" : "Enter a number",
					...state[field],
					onEdit: (text) => actions.edit(field, text),
					onReset: () => actions.resetField(field)
				}, field))
			});
		}
		// src/context-indicator-client.tsx
		const NS$1 = "codexContext";
		const contextDictionaries = {
			en: {
				label: "Codex context",
				estimate: "estimate",
				sample: "last request + estimated growth",
				unknown: "not available",
				details: "Approximate occupied context, not billing or ChatGPT quota. Hidden image/provider overhead and in-flight output may be missing."
			},
			ru: {
				label: "Контекст Codex",
				estimate: "оценка",
				sample: "последний запрос + оценка прироста",
				unknown: "нет данных",
				details: "Приблизительно занятый контекст, не billing и не квота ChatGPT. Скрытые затраты провайдера/изображений и текущий незавершённый ответ могут не учитываться."
			},
			zh: {
				label: "Codex 上下文",
				estimate: "估算",
				sample: "最近请求 + 估算增量",
				unknown: "暂无数据",
				details: "估算的上下文占用，不是计费用量或 ChatGPT 配额。可能不包括隐藏的图片/提供方开销及正在生成的输出。"
			}
		};
		function contextForRoute(view, route) {
			return route?.provider === "openai-codex" && view?.provider === route.provider && view.model === route.model ? view : null;
		}
		function CodexContextIndicator({ t, useProjection }) {
			const selection = useProjection("modelSelection");
			const raw = useProjection("codexContext");
			const route = selection?.next ?? selection?.lastUsed;
			if (route?.provider !== "openai-codex") return null;
			const view = contextForRoute(raw, route);
			const total = view?.totalTokens;
			const capacity = view?.capacity;
			const percent = total != null && capacity != null ? Math.round(total / capacity * 100) : null;
			const amount = total == null ? t("unknown") : total.toLocaleString() + (capacity != null ? " / " + capacity.toLocaleString() : "");
			const source = view?.source === "contextUsage" ? t("sample") : t("estimate");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				"data-codex-context": "",
				title: t("details"),
				style: {
					display: "inline-flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: 6,
					fontSize: 12,
					color: "var(--dsw-alias-label-secondary)",
					padding: "4px 8px",
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 8
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("label") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						total != null ? "≈ " : "",
						amount,
						percent === null ? "" : " · " + percent + "%"
					] }),
					total != null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: { opacity: .75 },
						children: [
							"(",
							source,
							")"
						]
					}),
					percent !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						role: "meter",
						"aria-label": t("label"),
						"aria-valuemin": 0,
						"aria-valuemax": 100,
						"aria-valuenow": Math.min(100, Math.max(0, percent)),
						"aria-valuetext": amount,
						style: {
							display: "inline-block",
							width: 42,
							height: 4,
							background: "var(--dsw-alias-interactive-bg-hover)",
							borderRadius: 3
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
							display: "block",
							height: "100%",
							width: Math.min(100, Math.max(0, percent)) + "%",
							background: percent >= 90 ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-label-secondary)",
							borderRadius: 3
						} })
					})
				]
			});
		}
		function applyContextIndicator(ctx) {
			const locale = ctx.locale;
			for (const [lang, dict] of Object.entries(contextDictionaries)) ctx.effect(() => locale.register(NS$1, lang, dict), "codex-context.locale." + lang);
		}
		// src/limits-client.tsx
		const NS = "codexUsageLimits";
		const dictionaries = {
			en: {
				used: "{percent}% used",
				hours: "{count}h",
				days: "{count}d",
				minutes: "{count}m",
				primary: "Primary window",
				secondary: "Secondary window",
				reset: "Resets: {time}",
				loading: "ChatGPT limits: loading…",
				unavailable: "ChatGPT limits unavailable",
				empty: "ChatGPT limits not reported",
				remaining: "{percent}% remaining",
				duration: "Window duration: {time}",
				unknown: "Not reported",
				updated: "Last fetched: {time}",
				refresh: "Refresh",
				explanation: "ChatGPT usage quota, not a token counter. Only reported windows are shown.",
				untilReset: "Time until reset: {time}",
				seconds: "{count}s"
			},
			ru: {
				used: "{percent}% использовано",
				hours: "{count} ч",
				days: "{count} д",
				minutes: "{count} мин",
				primary: "Основной лимит",
				secondary: "Дополнительный лимит",
				reset: "Сброс: {time}",
				loading: "Лимиты ChatGPT: загрузка…",
				unavailable: "Лимиты ChatGPT недоступны",
				empty: "ChatGPT не сообщил лимиты",
				remaining: "{percent}% осталось",
				duration: "Длительность окна: {time}",
				unknown: "Не сообщено",
				updated: "Последнее получение: {time}",
				refresh: "Обновить",
				explanation: "Квота использования ChatGPT, а не счётчик токенов. Показаны только сообщённые окна.",
				untilReset: "До сброса: {time}",
				seconds: "{count} с"
			},
			zh: {
				used: "已使用 {percent}%",
				hours: "{count}小时",
				days: "{count}天",
				minutes: "{count}分钟",
				primary: "主要窗口",
				secondary: "次要窗口",
				reset: "重置时间：{time}",
				loading: "ChatGPT 配额加载中…",
				unavailable: "ChatGPT 配额不可用",
				empty: "ChatGPT 未提供配额",
				remaining: "剩余 {percent}%",
				duration: "窗口时长：{time}",
				unknown: "未提供",
				updated: "上次获取：{time}",
				refresh: "刷新",
				explanation: "这是 ChatGPT 使用配额，不是令牌计数器。仅显示服务报告的窗口。",
				untilReset: "距重置：{time}",
				seconds: "{count}秒"
			}
		};
		function windowLabel(row, t) {
			const minutes = row.windowDurationMins;
			if (minutes === null) return t(row.window);
			if (minutes % 1440 === 0) return t("days", { count: minutes / 1440 });
			if (minutes % 60 === 0) return t("hours", { count: minutes / 60 });
			return t("minutes", { count: minutes });
		}
		function CodexLimits({ t, useProjection }) {
			const selection = useProjection("modelSelection");
			return (selection?.next ?? selection?.lastUsed)?.provider === "openai-codex" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexLimitsPolling, {
				t,
				useProjection
			}) : null;
		}
		function CodexLimitsPolling({ t, useProjection }) {
			const [snapshot, setSnapshot] = (0, react.useState)();
			const [failed, setFailed] = (0, react.useState)(false);
			const [open, setOpen] = (0, react.useState)(false);
			const panelRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const panelId = (0, react.useId)();
			(0, react.useEffect)(() => {
				if (!open) return;
				const close = () => {
					panelRef.current?.hidePopover();
					setOpen(false);
				};
				const panel = panelRef.current;
				const sync = () => setOpen(panel?.matches(":popover-open") ?? false);
				panel?.addEventListener("toggle", sync);
				window.addEventListener("resize", close);
				return () => {
					window.removeEventListener("resize", close);
					panel?.removeEventListener("toggle", sync);
				};
			}, [open]);
			const [updatedAt, setUpdatedAt] = (0, react.useState)();
			const [refreshKey, setRefreshKey] = (0, react.useState)(0);
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			const [now, setNow] = (0, react.useState)(Date.now());
			(0, react.useEffect)(() => {
				const timer = window.setInterval(() => setNow(Date.now()), 1e3);
				return () => window.clearInterval(timer);
			}, []);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				let busy = false;
				const refresh = async () => {
					if (busy || document.hidden) return;
					busy = true;
					setRefreshing(true);
					try {
						const response = await fetch("/api/codex-oauth/limits", {
							credentials: "same-origin",
							headers: { accept: "application/json" },
							signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15e3)])
						});
						if (!response.ok) throw new Error("Limits unavailable");
						const next = await response.json();
						if (!Array.isArray(next.windows)) throw new Error("Invalid limits");
						if (!controller.signal.aborted) {
							setSnapshot(next);
							setFailed(false);
							setUpdatedAt(Date.now());
							setNow(Date.now());
						}
					} catch {
						if (!controller.signal.aborted) {
							setSnapshot(void 0);
							setFailed(true);
						}
					} finally {
						busy = false;
						if (!controller.signal.aborted) setRefreshing(false);
					}
				};
				refresh();
				const timer = window.setInterval(() => {
					refresh();
				}, 3e4);
				const visible = () => {
					if (!document.hidden) refresh();
				};
				document.addEventListener("visibilitychange", visible);
				return () => {
					controller.abort();
					window.clearInterval(timer);
					document.removeEventListener("visibilitychange", visible);
				};
			}, [refreshKey]);
			const rows = snapshot?.windows ?? [];
			const status = t(failed ? "unavailable" : snapshot === void 0 ? "loading" : "empty");
			const percent = (value) => new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(value);
			const remainingTime = (reset) => {
				const seconds = Math.max(0, Math.ceil(reset - now / 1e3));
				return [
					t("days", { count: Math.floor(seconds / 86400) }),
					t("hours", { count: Math.floor(seconds / 3600) % 24 }),
					t("minutes", { count: Math.floor(seconds / 60) % 60 }),
					t("seconds", { count: seconds % 60 })
				].join(" ");
			};
			const icon = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.6",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4 16a9 9 0 1 1 16 0M12 12l4-4",
					strokeLinecap: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "12",
					cy: "12",
					r: "2"
				})]
			});
			const toggle = () => {
				const panel = panelRef.current;
				const trigger = triggerRef.current;
				if (!panel || !trigger) return;
				if (open) {
					panel.hidePopover();
					setOpen(false);
					return;
				}
				panel.showPopover();
				const anchor = trigger.getBoundingClientRect();
				const box = panel.getBoundingClientRect();
				panel.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12))}px`;
				panel.style.top = `${Math.max(12, anchor.top - box.height - 8)}px`;
				setOpen(true);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				"data-codex-limits": rows.length ? "windows" : "status",
				style: {
					display: "inline-flex",
					minWidth: 0
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: `
      /* Presentation-only compatibility selector for Harness 0.2.1-rc.5.
         Scoped to this composer and only while its Codex control is mounted. */
      [data-composer-dock]:has([data-codex-limits]) > .JObwrW_root,
      [data-composer-dock]:has([data-codex-limits]) [data-composer-stat="usage"]{display:none}
      .codex-quota-pill{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;max-width:100%;border:0;border-radius:var(--dsw-radius-sm,6px);padding:1px 8px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:20px;font-variant-numeric:tabular-nums;cursor:pointer;white-space:nowrap}
      .codex-quota-pill:hover,.codex-quota-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
      .codex-quota-pill:focus-visible,.codex-quota-refresh:focus-visible{outline:2px solid var(--dsw-alias-label-secondary);outline-offset:2px}
      .codex-quota-panel{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:360px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;border:0;border-radius:var(--dsw-radius-lg,12px);padding:16px;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
      .codex-quota-refresh{border:0;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-interactive-bg-hover);color:inherit;padding:4px 8px;font:inherit;cursor:pointer}
      .codex-quota-refresh:disabled{opacity:.5;cursor:wait}
    ` }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						ref: triggerRef,
						className: "codex-quota-pill",
						type: "button",
						"aria-haspopup": "dialog",
						"aria-expanded": open,
						"aria-controls": panelId,
						onClick: toggle,
						title: rows.length ? t("explanation") : status,
						children: [
							icon,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Codex" }),
							rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								title: windowLabel(row, t),
								style: { color: row.usedPercent >= 90 ? "var(--dsw-alias-state-warn-primary)" : "inherit" },
								children: [percent(row.usedPercent), "%"]
							}, `${row.id}:${row.window}`)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
								width: "10",
								height: "10",
								viewBox: "0 0 16 16",
								fill: "none",
								stroke: "currentColor",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: open ? "m4 10 4-4 4 4" : "m4 6 4 4 4-4" })
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: panelRef,
						id: panelId,
						popover: "auto",
						role: "dialog",
						"aria-label": "ChatGPT",
						className: "codex-quota-panel",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									gap: 16,
									paddingBottom: 10,
									borderBottom: "0.5px solid var(--dsw-alias-border-l2)"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", {
									style: {
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
										color: "var(--dsw-alias-label-primary)",
										fontWeight: 500
									},
									children: [icon, " ChatGPT"]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "codex-quota-refresh",
									type: "button",
									disabled: refreshing,
									onClick: () => setRefreshKey((value) => value + 1),
									children: t("refresh")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexContextIndicator, {
								useProjection,
								t: (key) => t(key === "unknown" ? "unknownContext" : key)
							}),
							!rows.length && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								role: "status",
								children: status
							}),
							rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								"data-codex-limit-window": row.window,
								style: {
									padding: "12px 0",
									borderBottom: "0.5px solid var(--dsw-alias-border-l2)"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											justifyContent: "space-between",
											gap: 12,
											marginBottom: 8
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												color: "var(--dsw-alias-label-primary)",
												fontWeight: 500
											},
											children: [
												row.name,
												" · ",
												windowLabel(row, t)
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: { color: row.usedPercent >= 90 ? "var(--dsw-alias-state-warn-primary)" : "inherit" },
											children: t("used", { percent: percent(row.usedPercent) })
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										role: "progressbar",
										"aria-label": row.name + " · " + windowLabel(row, t),
										"aria-valuemin": 0,
										"aria-valuemax": 100,
										"aria-valuenow": Math.max(0, Math.min(100, row.usedPercent)),
										style: {
											height: 4,
											borderRadius: 4,
											background: "var(--dsw-alias-interactive-bg-hover)",
											overflow: "hidden",
											marginBottom: 8
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
											height: "100%",
											width: `${Math.max(0, Math.min(100, row.usedPercent))}%`,
											borderRadius: "inherit",
											background: row.usedPercent >= 90 ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-label-secondary)"
										} })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("remaining", { percent: percent(Math.max(0, 100 - row.usedPercent)) }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("duration", { time: row.windowDurationMins === null ? t("unknown") : windowLabel(row, t) }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("reset", { time: row.resetsAt === null ? t("unknown") : (/* @__PURE__ */ new Date(row.resetsAt * 1e3)).toLocaleString() }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: { color: "var(--dsw-alias-label-tertiary)" },
										children: t("untilReset", { time: row.resetsAt === null ? t("unknown") : remainingTime(row.resetsAt) })
									})
								]
							}, `${row.id}:${row.window}`)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									marginTop: 10,
									color: "var(--dsw-alias-label-tertiary)"
								},
								children: t("updated", { time: updatedAt === void 0 ? t("unknown") : new Date(updatedAt).toLocaleString() })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									marginTop: 6,
									color: "var(--dsw-alias-label-tertiary)"
								},
								children: t("explanation")
							})
						]
					})
				]
			});
		}
		function applyLimits(ctx) {
			const locale = ctx.locale;
			for (const [language, dict] of Object.entries(dictionaries)) ctx.effect(() => locale.register(NS, language, {
				...dict,
				...contextDictionaries[language],
				unknown: dict.unknown,
				unknownContext: contextDictionaries[language].unknown
			}), `codex-limits.locale.${language}`);
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "codex-account-limits",
				order: 2,
				locale: NS
			}, CodexLimits));
		}
		// src/client.tsx
		const ENDPOINT = "/api/codex-oauth";
		function pageCopy(language) {
			const ru = language.startsWith("ru");
			const zh = language.startsWith("zh");
			return ru ? {
				title: "OpenAI · Codex",
				intro: "Аккаунт ChatGPT, компоненты и контекст диалогов.",
				connected: "Подключён",
				disconnected: "Не подключён",
				login: "Войти через ChatGPT",
				waiting: "Ожидание авторизации…",
				logout: "Выйти",
				refresh: "Обновить",
				models: "Доступные модели",
				noModels: "Модели появятся после входа.",
				popup: "Продолжить вход в браузере"
			} : zh ? {
				title: "OpenAI · Codex",
				intro: "使用 ChatGPT 账户连接 GPT 模型。登录和 token 刷新完全由本机 Codex app-server 管理。",
				connected: "已连接",
				disconnected: "尚未连接",
				login: "使用 ChatGPT 登录",
				waiting: "等待浏览器授权…",
				logout: "退出登录",
				refresh: "刷新状态",
				models: "可用模型",
				noModels: "登录后将显示账户可用的模型。",
				popup: "如果登录页没有自动打开，请点击这里继续。"
			} : {
				title: "OpenAI · Codex",
				intro: "Connect GPT models with your ChatGPT account. The local Codex app-server owns login and token refresh.",
				connected: "Connected",
				disconnected: "Not connected",
				login: "Sign in with ChatGPT",
				waiting: "Waiting for browser authorization…",
				logout: "Sign out",
				refresh: "Refresh status",
				models: "Available models",
				noModels: "Models available to your account appear after sign-in.",
				popup: "If the sign-in page did not open, continue here."
			};
		}
		async function request(path = "", method = "GET") {
			const response = await fetch(`${ENDPOINT}${path}`, {
				method,
				headers: { accept: "application/json" },
				credentials: "same-origin"
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.error ?? `HTTP ${String(response.status)}`);
			return body;
		}
		const styles = {
			section: {
				maxWidth: 720,
				padding: "4px 0 32px"
			},
			title: {
				fontSize: 20,
				margin: "0 0 8px"
			},
			intro: {
				color: "var(--dsw-alias-label-secondary, currentColor)",
				lineHeight: 1.6,
				margin: "0 0 20px"
			},
			card: {
				border: "1px solid var(--dsw-alias-border-l2-darkmode-thin, #888)",
				borderRadius: 12,
				padding: 20
			},
			row: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 16
			},
			status: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				fontWeight: 600
			},
			meta: {
				color: "var(--dsw-alias-label-secondary, currentColor)",
				fontSize: 13,
				marginTop: 6
			},
			actions: {
				display: "flex",
				flexWrap: "wrap",
				gap: 8,
				marginTop: 18
			},
			error: {
				color: "#b42318",
				marginTop: 12
			},
			models: { marginTop: 24 },
			list: {
				margin: "10px 0 0",
				paddingLeft: 20,
				lineHeight: 1.8
			}
		};
		function OpenAiOAuthSection({ policy, manageComponents, language = "en" }) {
			const ru = language.startsWith("ru");
			const copy = pageCopy(language);
			const [modelsOpen, setModelsOpen] = (0, react.useState)(false);
			const [status, setStatus] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [waiting, setWaiting] = (0, react.useState)(false);
			const [authUrl, setAuthUrl] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const refresh = (0, react.useCallback)(async () => {
				try {
					const next = await request();
					setStatus(next);
					setError(void 0);
					if (next.authenticated) {
						setWaiting(false);
						setAuthUrl(void 0);
					}
					return next;
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
					return;
				}
			}, []);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			(0, react.useEffect)(() => {
				if (!waiting) return;
				const timer = window.setInterval(() => {
					refresh();
				}, 1200);
				return () => {
					window.clearInterval(timer);
				};
			}, [refresh, waiting]);
			const login = async () => {
				const popup = window.open("about:blank", "_blank");
				if (popup !== null) popup.opener = null;
				setBusy(true);
				setError(void 0);
				try {
					const result = await request("/login", "POST");
					if (typeof result.authUrl !== "string") throw new Error("Codex did not return an authentication URL.");
					setAuthUrl(result.authUrl);
					setWaiting(true);
					if (popup !== null) popup.location.href = result.authUrl;
				} catch (reason) {
					popup?.close();
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setBusy(false);
				}
			};
			const logout = async () => {
				setBusy(true);
				setError(void 0);
				try {
					await request("/logout", "POST");
					await refresh();
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setBusy(false);
				}
			};
			const connected = status?.authenticated === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: styles.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: styles.title,
						children: copy.title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.intro,
						children: copy.intro
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.card,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: styles.row,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: styles.status,
									role: "status",
									"aria-live": "polite",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: status === void 0 ? "ongoing" : connected ? "done" : "idle" }), status === void 0 ? error ? ru ? "Не удалось получить статус" : "Status unavailable" : ru ? "Подключение…" : "Connecting…" : connected ? copy.connected : copy.disconnected]
								}), connected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: styles.meta,
									children: [status.email, status.planType].filter(Boolean).join(" · ")
								}) : null] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles.actions,
								children: [connected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									type: "button",
									disabled: busy,
									onClick: () => {
										logout();
									},
									children: copy.logout
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									type: "button",
									disabled: busy || waiting,
									onClick: () => {
										login();
									},
									children: waiting ? copy.waiting : copy.login
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									type: "button",
									disabled: busy,
									onClick: () => {
										refresh();
									},
									children: copy.refresh
								})]
							}),
							authUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: authUrl,
								target: "_blank",
								rel: "noreferrer",
								children: copy.popup
							}) }),
							error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: styles.error,
								role: "alert",
								children: error
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: styles.models,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
									icon: null,
									title: `${copy.models}${status?.models.length ? ` (${status.models.length})` : ""}`,
									open: modelsOpen,
									expandable: true,
									onToggle: () => setModelsOpen((open) => !open),
									expandOnRowClick: true,
									children: status?.models.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
										style: styles.list,
										children: status.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
											model.name,
											" ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: model.id })
										] }, model.id))
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: styles.meta,
										children: copy.noModels
									})
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.models,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: ru ? "Компоненты" : "Components" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: styles.intro,
								children: ru ? "Провайдер, поиск, загрузка страниц, картинки и политика контекста включаются независимо в карточке плагина." : "Provider, search, page fetching, images and context policy can be enabled independently in the plugin card."
							}),
							manageComponents ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: manageComponents,
								children: ru ? "Управлять компонентами" : "Manage components"
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.models,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: ru ? "Контекст и старые сессии" : "Context and older sessions" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: styles.intro,
								children: ru ? "Сжатие выполняет Harness: его плагины контекста продолжают управлять историей. Интервал простоя — наша политика, а не гарантированный срок кэша OpenAI." : "Harness performs compaction, so context plugins keep control of history. The idle interval is our policy, not a guaranteed OpenAI cache lifetime."
							}),
							policy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ContextSettings, {
								scope: policy,
								ru
							}) : null
						]
					})
				]
			});
		}
		const inject = [
			"slots",
			"locale",
			"configForms"
		];
		function apply(ctx) {
			applyLimits(ctx);
			applyContextIndicator(ctx);
			const policy = ctx.configForms.get("codex-context-policy");
			const subscribeLocale = (listener) => ctx.locale.subscribe(listener);
			const getLocale = () => ctx.locale.getLocale().active;
			const Section = (props) => {
				const language = (0, react.useSyncExternalStore)(subscribeLocale, getLocale);
				const navigation = ctx.get("pluginNavigation");
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenAiOAuthSection, {
					...props,
					language,
					policy,
					...navigation ? { manageComponents: () => {
						props.close();
						navigation.openBundle("dsh-openai-oauth");
					} } : {}
				});
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "openai-oauth",
				order: 11,
				label: () => "OpenAI · Codex"
			}, Section));
		}
		exports.OpenAiOAuthSection = OpenAiOAuthSection;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
