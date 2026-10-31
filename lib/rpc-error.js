/** Keep RPC diagnostics intact without importing Harness into the standalone login CLI. */
export class CodexRpcError extends Error {
    code;
    data;
    constructor(value) {
        const detail = value !== null && typeof value === 'object' ? value : {};
        super(typeof detail.message === 'string' ? detail.message : 'Codex app-server request failed');
        this.name = 'CodexRpcError';
        this.code = detail.code;
        this.data = detail.data;
    }
}
