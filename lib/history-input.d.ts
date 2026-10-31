export declare const INPUT_BUDGET = 200000;
export declare const HISTORY_CHUNK = 120000;
export declare const VERBATIM_TAIL = 60000;
export declare const SUMMARY_BUDGET = 16000;
export declare function splitText(text: string, size: number): string[];
export declare function boundedInput(text: string, summarize: (fragment: string, position: string) => Promise<string>, signal?: AbortSignal): Promise<string>;
/** Yields progress BEFORE slow model work; never silently truncates data. */
export declare function recoverySteps(text: string, summarize: (fragment: string, position: string) => Promise<string>, signal?: AbortSignal): AsyncGenerator<string, string>;
