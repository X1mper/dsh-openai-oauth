import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { ContextPolicyConfig } from './context-policy.js';
import type { ReactNode } from 'react';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client';
import { type NamedAccount } from './account-ui.js';
declare function AccountSection({ account, policy, contextControls, manageComponents, language }: SettingsSectionOwnerProps & {
    account: NamedAccount;
    contextControls?: ReactNode;
    language?: string;
    policy?: ConfigForm<ContextPolicyConfig>;
    manageComponents?: () => void;
}): ReactNode;
export declare function OpenAiOAuthSection(props: Parameters<typeof AccountSection>[0] extends infer P ? Omit<P, 'account'> : never): ReactNode;
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export {};
