import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { Context } from '@deepseek-ai/cordis';
import { AppServer } from './app-server.js';
type Store = Pick<AttachmentStore, 'readImage' | 'saveImage'>;
type Message = {
    content: readonly ContentBlock[];
};
export interface ImageRequest {
    prompt: string;
    image_ids?: string[];
    transparent_background?: boolean;
}
export interface GeneratedImage {
    image: ImageAttachmentRef;
    mode: 'generate' | 'edit';
    generationId: string | null;
}
export declare function resolveEditImages(ids: readonly string[], messages: readonly Message[]): ImageAttachmentRef[];
export declare class CodexImageGenerator {
    private readonly server;
    private readonly store;
    constructor(server: AppServer, store: Store);
    run(mode: 'generate' | 'edit', request: ImageRequest, messages: readonly Message[], model?: string, signal?: AbortSignal, record?: (event: Record<string, unknown>) => void): Promise<GeneratedImage>;
}
export declare function applyImageTools(ctx: Context, server: AppServer): void;
export {};
