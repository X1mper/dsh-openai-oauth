import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { ContextPolicyConfig } from './context-policy.js';
import type { ReactNode } from 'react';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client';
export declare function OpenAiOAuthSection({ policy, manageComponents, language }: SettingsSectionOwnerProps & {
    language?: string;
    policy?: ConfigForm<ContextPolicyConfig>;
    manageComponents?: () => void;
}): ReactNode;
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
