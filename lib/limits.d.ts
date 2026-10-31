export interface LimitWindow {
    id: string;
    name: string;
    window: 'primary' | 'secondary';
    usedPercent: number;
    windowDurationMins: number | null;
    resetsAt: number | null;
}
/** Expose only provider-reported windows, never credentials/account identities. */
export declare function limitWindows(payload: Record<string, unknown>): LimitWindow[];
