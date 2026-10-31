export function isLegacyToolResult(block) {
    return block !== null && typeof block === 'object' && block.type === 'tool-result';
}
