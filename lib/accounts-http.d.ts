import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CodexRuntime } from './runtime.js';
import { type RequestGate } from './oauth-http.js';
export declare function handleAccountsRequest(runtime: CodexRuntime, req: IncomingMessage, res: ServerResponse, gate?: RequestGate): Promise<void>;
