import type { CodexContextView } from './context-indicator.js';
import type { Context } from '@deepseek-ai/cordis';
import type { SessionStandardProps, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { ReactNode } from 'react';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        codexContext: 'label' | 'estimate' | 'sample' | 'unknown' | 'details';
    }
}
declare const NS = "codexContext";
export declare const contextDictionaries: {
    en: {
        label: string;
        estimate: string;
        sample: string;
        unknown: string;
        details: string;
    };
    ru: {
        label: string;
        estimate: string;
        sample: string;
        unknown: string;
        details: string;
    };
    zh: {
        label: string;
        estimate: string;
        sample: string;
        unknown: string;
        details: string;
    };
};
export declare function contextForRoute(view: CodexContextView | null | undefined, route: {
    provider: string;
    model: string;
} | null | undefined): CodexContextView | null;
export declare function CodexContextIndicator({ t, useProjection }: {
    t: TranslateNS<typeof NS>;
    useProjection: SessionStandardProps['useProjection'];
}): ReactNode;
export declare function applyContextIndicator(ctx: Context): void;
export {};
