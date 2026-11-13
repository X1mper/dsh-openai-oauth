type JsonObject = Record<string, unknown>;
export type ServerEvent = {
    method: string;
    params: JsonObject;
    requestId?: string | number;
};
export declare class AppServer {
    private readonly home;
    constructor(home?: string);
    private child?;
    private nextId;
    private readonly pending;
    private readonly queues;
    private readonly turnThreads;
    private starting?;
    start(): Promise<void>;
    private startInner;
    private send;
    private receive;
    private threadIdFromTurn;
    private queue;
    request(method: string, params: JsonObject): Promise<JsonObject>;
    account(refreshToken?: boolean): Promise<JsonObject | null>;
    startChatGptLogin(): Promise<JsonObject>;
    logout(): Promise<void>;
    rateLimits(): Promise<JsonObject>;
    models(): Promise<JsonObject[]>;
    /** Harness owns skill discovery and loading; never advertise a second catalog.
     * Re-scan at thread boundaries so newly installed Codex skills are covered too.
     * Overrides are thread-local: no config files or bundled skill files are changed.
     */
    private isolatedConfig;
    startThread(input: JsonObject): Promise<string>;
    startTurn(threadId: string, input: JsonObject): Promise<string>;
    steerTurn(threadId: string, expectedTurnId: string, input: string | JsonObject[]): Promise<void>;
    /** Resume only an exact, completed checkpoint, never a stale tool RPC. */
    resumeCompletedThread(threadId: string, turnId: string, cwd?: string): Promise<boolean>;
    releaseThread(threadId: string): Promise<void>;
    nextEvent(threadId: string, signal?: AbortSignal): Promise<ServerEvent>;
    respond(id: string | number, result: JsonObject): void;
    interrupt(threadId: string, turnId: string): Promise<void>;
    close(): void;
}
export {};
