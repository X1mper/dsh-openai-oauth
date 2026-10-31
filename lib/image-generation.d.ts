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
    path?: string;
}
export declare const IMAGE_TOOL_GUIDANCE = "Harness image tools are self-contained: call image_generate for a new image or image_edit with current attachment IDs for a reference-based image. No imagegen skill, CLI, or API-key setup is required. After success, inspect the returned image and deliver it in the SAME turn: use the exact returned path in ![description](<absolute path>) in your final response, and when present is available call present with that path for a downloadable file card. An image in a tool result or image() output is not proof the user has received the final deliverable. Do not finish with only \"Done\". Do not glob Codex directories, calculate hashes to find output files, invent paths, or regenerate just to display an existing result. Keep the attachment ID for subsequent image_edit calls; it is not a file path.";
/** Expose only an existing native output whose bytes match this generation.
 * The path is a convenience for Harness presentation, never an image input.
 */
export declare function verifiedImagePath(savedPath: unknown, data: Uint8Array, signal?: AbortSignal, root?: string): Promise<string | undefined>;
export declare function resolveEditImages(ids: readonly string[], messages: readonly Message[]): ImageAttachmentRef[];
export declare class CodexImageGenerator {
    private readonly server;
    private readonly store;
    constructor(server: AppServer, store: Store);
    run(mode: 'generate' | 'edit', request: ImageRequest, messages: readonly Message[], model?: string, signal?: AbortSignal, record?: (event: Record<string, unknown>) => void): Promise<GeneratedImage>;
}
export declare function applyImageTools(ctx: Context, server: AppServer): void;
export {};
