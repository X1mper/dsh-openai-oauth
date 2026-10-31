import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { ContextPolicyConfig } from './context-policy.js';
export declare function ContextSettings({ scope, ru }: {
    scope: ConfigForm<ContextPolicyConfig>;
    ru: boolean;
}): import("react").JSX.Element;
