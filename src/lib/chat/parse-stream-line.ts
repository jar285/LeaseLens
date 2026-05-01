export type StreamLineMessage =
  | { conversationId: string }
  | { chunk: string }
  | { error: string }
  | { quota: { remaining: number } }
  | { tool_use: { id: string; name: string; input: Record<string, unknown> } }
  | {
      tool_result: {
        id: string;
        name: string;
        result: unknown;
        error?: string;
      };
    };

export function parseStreamLine(line: string): StreamLineMessage | null {
  try {
    const parsed: unknown = JSON.parse(line);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'conversationId' in parsed &&
      typeof parsed.conversationId === 'string'
    ) {
      return { conversationId: parsed.conversationId };
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'chunk' in parsed &&
      typeof parsed.chunk === 'string'
    ) {
      return { chunk: parsed.chunk };
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof parsed.error === 'string'
    ) {
      return { error: parsed.error };
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'quota' in parsed &&
      typeof (parsed as { quota?: unknown }).quota === 'object' &&
      (parsed as { quota?: unknown }).quota !== null
    ) {
      return {
        quota: (parsed as { quota: { remaining: number } }).quota,
      };
    }

    // Tool use event
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'tool_use' in parsed &&
      typeof (parsed as { tool_use?: unknown }).tool_use === 'object' &&
      (parsed as { tool_use?: unknown }).tool_use !== null
    ) {
      const toolUse = (
        parsed as {
          tool_use: {
            id: string;
            name: string;
            input: Record<string, unknown>;
          };
        }
      ).tool_use;
      return { tool_use: toolUse };
    }

    // Tool result event
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'tool_result' in parsed &&
      typeof (parsed as { tool_result?: unknown }).tool_result === 'object' &&
      (parsed as { tool_result?: unknown }).tool_result !== null
    ) {
      const toolResult = (
        parsed as {
          tool_result: {
            id: string;
            name: string;
            result: unknown;
            error?: string;
          };
        }
      ).tool_result;
      return { tool_result: toolResult };
    }

    return null;
  } catch {
    return null;
  }
}
