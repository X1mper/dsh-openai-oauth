import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import { AppServer } from './app-server.js';
import { type ImageStore } from './images.js';
export declare class CodexAppServerAdapter extends LlmAdapter {
    private readonly sessionCwd?;
    private readonly server;
    private readonly sessions;
    private readonly images;
    private modelsCache?;
    private modelsCachedAt;
    private readonly contextWindows;
    constructor(server?: AppServer, sessionCwd?: ((sessionId: string) => string | undefined) | undefined, attachments?: ImageStore);
    private configurationKey;
    private replayState;
    private restoreSession;
    providerInfo(): {
        id: string;
        name: string;
    };
    private models;
    listModels(): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, modelId: string): Promise<LlmResolvedModelInfo>;
    private createSession;
    private session;
    private resumeTools;
    private observeUsage;
    private nextEvent;
    private collectToolCalls;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private streamRequest;
}
