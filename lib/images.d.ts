import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
export type ImageStore = Pick<AttachmentStore, 'readImage'>;
export type InputPart = {
    type: 'text';
    text: string;
} | {
    type: 'image';
    url: string;
};
export type ToolPart = {
    type: 'inputText';
    text: string;
} | {
    type: 'inputImage';
    imageUrl: string;
};
export declare class ImageBridge {
    private readonly store?;
    constructor(store?: ImageStore | undefined);
    private url;
    /** Ordered tool content, including MCP screenshots persisted by Harness. */
    toolContent(blocks: readonly ContentBlock[], signal?: AbortSignal): Promise<ToolPart[]>;
    /** Attach native images beside the textual transcript, labelled by durable id
     * and message position so replay never misattributes an old screenshot.
     * Image bytes never enter textual recovery summaries or fingerprints.
     */
    historyImages(messages: readonly {
        role: string;
        content: readonly ContentBlock[];
    }[], signal?: AbortSignal): Promise<InputPart[]>;
}
