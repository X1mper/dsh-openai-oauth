import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { LlmError } from '@deepseek-ai/dsh-llm'

export type ImageStore = Pick<AttachmentStore, 'readImage'>
export type InputPart = { type: 'text'; text: string } | { type: 'image'; url: string }
export type ToolPart = { type: 'inputText'; text: string } | { type: 'inputImage'; imageUrl: string }

export class ImageBridge {
  constructor(private readonly store?: ImageStore) {}

  private async url(block: Extract<ContentBlock, { type: 'image' }>, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted()
    if (!this.store) throw new LlmError('Harness attachment storage is unavailable', 'UNSUPPORTED_CONTENT')
    const image = await this.store.readImage(block.attachment, signal)
    signal?.throwIfAborted()
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.ref.mediaType)) {
      throw new LlmError('Unsupported image media type', 'UNSUPPORTED_CONTENT')
    }
    return `data:${image.ref.mediaType};base64,${Buffer.from(image.data).toString('base64')}`
  }

  /** Ordered tool content, including MCP screenshots persisted by Harness. */
  async toolContent(blocks: readonly ContentBlock[], signal?: AbortSignal): Promise<ToolPart[]> {
    const parts: ToolPart[] = []
    for (const block of blocks) {
      if (block.type === 'text') parts.push({ type: 'inputText', text: block.text })
      else if (block.type === 'image') {
        if ((block as { offloaded?: boolean }).offloaded) {
          parts.push({ type: 'inputText', text: `[Previously offloaded image: ${block.attachment.name ?? block.attachment.attachmentId}; image bytes are not included.]` })
        } else parts.push({ type: 'inputImage', imageUrl: await this.url(block, signal) })
      } else if (block.type === 'tool-result') parts.push(...await this.toolContent(block.content, signal))
    }
    return parts.length ? parts : [{ type: 'inputText', text: '(no output)' }]
  }

  /** Attach native images beside the textual transcript, labelled by durable id
   * and message position so replay never misattributes an old screenshot.
   * Image bytes never enter textual recovery summaries or fingerprints.
   */
  async historyImages(messages: readonly { role: string; content: readonly ContentBlock[] }[], signal?: AbortSignal): Promise<InputPart[]> {
    const parts: InputPart[] = []
    const visit = async (blocks: readonly ContentBlock[], label: string): Promise<void> => {
      for (const block of blocks) {
        if (block.type === 'image' && !(block as { offloaded?: boolean }).offloaded) {
          parts.push({ type: 'text', text: `[Image ${block.attachment.attachmentId} from ${label}]` },
            { type: 'image', url: await this.url(block, signal) })
        } else if (block.type === 'tool-result') await visit(block.content, `${label}, tool result ${block.toolCallId}`)
      }
    }
    for (const [index, message] of messages.entries()) await visit(message.content, `message ${index + 1} (${message.role})`)
    return parts
  }
}
