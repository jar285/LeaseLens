import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { POST } from './route';

interface ConversationRow {
  id: string;
}

interface MessageRow {
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
}

describe('Chat API Persistence Integration', () => {
  const baseUrl = 'http://localhost:3000';

  beforeEach(() => {
    // Clean up DB for test
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM users').run();

    // Insert test user
    db.prepare(
      'INSERT INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(
      '00000000-0000-0000-0000-000000000001',
      'test@example.com',
      'Creator',
      'Test',
      0,
    );

    process.env.CONTENTOPS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
  });

  it('creates conversation, streams response, and persists messages', async () => {
    const messageContent = 'Test persistence message';

    // Create token
    const token = await encrypt({
      userId: '00000000-0000-0000-0000-000000000001', // creator-1
      role: 'Creator' as Role,
      displayName: 'Syndicate Creator',
    });

    const req = new NextRequest(new URL('/api/chat', baseUrl), {
      method: 'POST',
      body: JSON.stringify({ message: messageContent, conversationId: null }),
    });

    req.cookies.set('contentops_session', token);

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Read stream
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let _result = '';

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      _result += decoder.decode(value);
    }

    // Wait for the stream to fully finish its async operations if any
    // mockStreamGenerator has artificial delays, but the test awaits reader.read() which awaits the generator.

    // Verify DB state
    const convos = db
      .prepare('SELECT id FROM conversations')
      .all() as ConversationRow[];
    expect(convos).toHaveLength(1);

    const messages = db
      .prepare(
        'SELECT conversation_id, role, content FROM messages ORDER BY created_at ASC',
      )
      .all() as MessageRow[];
    expect(messages).toHaveLength(2); // user message + assistant message

    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe(messageContent);
    expect(messages[0].conversation_id).toBe(convos[0].id);

    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toContain('onboard Side Quest Syndicate');
  });
});
