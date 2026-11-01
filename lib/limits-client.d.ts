import type { ReactNode } from 'react';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SessionStandardProps, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'conversation.composer.dock': {
            kind: 'list';
            scope: 'session';
        };
    }
    interface LocaleNamespaceMap {
        codexUsageLimits: 'used' | 'hours' | 'days' | 'minutes' | 'primary' | 'secondary' | 'reset' | 'loading' | 'unavailable' | 'empty' | 'remaining' | 'duration' | 'unknown' | 'updated' | 'refresh' | 'explanation' | 'untilReset' | 'seconds' | 'label' | 'estimate' | 'sample' | 'unknownContext' | 'details';
    }
}
declare const NS = "codexUsageLimits";
type T = TranslateNS<typeof NS>;
export declare function CodexLimits({ t, useProjection }: {
    t: T;
    useProjection: SessionStandardProps['useProjection'];
}): ReactNode;
export declare function applyLimits(ctx: ClientContext): void;
export {};
