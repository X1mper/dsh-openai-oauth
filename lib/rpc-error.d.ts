/** Keep RPC diagnostics intact without importing Harness into the standalone login CLI. */
export declare class CodexRpcError extends Error {
    readonly code: unknown;
    readonly data: unknown;
    constructor(value: unknown);
}
