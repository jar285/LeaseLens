export type StreamLineMessage =
  | { conversationId: string }
  | { chunk: string }
  | { error: string }
  | { quota: { remaining: number } };

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

    return null;
  } catch {
    return null;
  }
}
