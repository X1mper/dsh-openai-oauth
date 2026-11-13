import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { AppServer } from './app-server.js';
/** Native Connection admission includes configured Host/Origin and browser/API authentication. */
export type RequestGate = (req: IncomingMessage) => 401 | 403 | undefined;
export declare function trusted(req: IncomingMessage, gate?: RequestGate): boolean;
export declare function json(res: ServerResponse, status: number, body: unknown): void;
export declare function handleOAuthRequest(server: Pick<AppServer, 'account' | 'models' | 'startChatGptLogin' | 'logout'> & Partial<Pick<AppServer, 'rateLimits' | 'startDeviceCodeLogin' | 'cancelLogin'>>, req: IncomingMessage, res: ServerResponse, gate?: RequestGate): Promise<void>;
export declare function oauthRoute(server: AppServer, gate: RequestGate): WebRoute;
