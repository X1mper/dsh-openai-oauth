import { LlmError } from '@deepseek-ai/dsh-llm';
export class ImageBridge {
    store;
    constructor(store) {
        this.store = store;
    }
    async url(block, signal) {
        signal?.throwIfAborted();
        if (!this.store)
            throw new LlmError('Harness attachment storage is unavailable', 'UNSUPPORTED_CONTENT');
        const image = await this.store.readImage(block.attachment, signal);
        signal?.throwIfAborted();
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.ref.mediaType)) {
            throw new LlmError('Unsupported image media type', 'UNSUPPORTED_CONTENT');
        }
        return `data:${image.ref.mediaType};base64,${Buffer.from(image.data).toString('base64')}`;
    }
    /** Ordered tool content, including MCP screenshots persisted by Harness. */
    async toolContent(blocks, signal) {
        const parts = [];
        for (const block of blocks) {
            if (block.type === 'text')
                parts.push({ type: 'inputText', text: block.text });
            else if (block.type === 'image') {
                if (block.offloaded) {
                    parts.push({ type: 'inputText', text: `[Previously offloaded image: ${block.attachment.name ?? block.attachment.attachmentId}; image bytes are not included.]` });
                }
                else
                    parts.push({ type: 'inputImage', imageUrl: await this.url(block, signal) });
            }
            else if (block.type === 'tool-result')
                parts.push(...await this.toolContent(block.content, signal));
        }
        return parts.length ? parts : [{ type: 'inputText', text: '(no output)' }];
    }
    /** Attach native images beside the textual transcript, labelled by durable id
     * and message position so replay never misattributes an old screenshot.
     * Image bytes never enter textual recovery summaries or fingerprints.
     */
    async historyImages(messages, signal) {
        const parts = [];
        const visit = async (blocks, label) => {
            for (const block of blocks) {
                if (block.type === 'image' && !block.offloaded) {
                    parts.push({ type: 'text', text: `[Image ${block.attachment.attachmentId} from ${label}]` }, { type: 'image', url: await this.url(block, signal) });
                }
                else if (block.type === 'tool-result')
                    await visit(block.content, `${label}, tool result ${block.toolCallId}`);
            }
        };
        for (const [index, message] of messages.entries())
            await visit(message.content, `message ${index + 1} (${message.role})`);
        return parts;
    }
}
