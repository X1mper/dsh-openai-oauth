import type { ReactNode } from 'react';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'conversation.composer.dock': {
            kind: 'list';
            scope: 'session';
        };
    }
    interface LocaleNamespaceMap {
        codexUsageLimits: 'used' | 'hours' | 'days' | 'minutes' | 'primary' | 'secondary' | 'reset' | 'loading' | 'unavailable' | 'empty' | 'remaining' | 'duration' | 'unknown' | 'updated' | 'refresh' | 'explanation' | 'untilReset' | 'seconds';
    }
}
declare const NS = "codexUsageLimits";
type T = TranslateNS<typeof NS>;
export declare function CodexLimits({ t }: {
    t: T;
}): ReactNode;
export declare function applyLimits(ctx: ClientContext): void;
export {};
