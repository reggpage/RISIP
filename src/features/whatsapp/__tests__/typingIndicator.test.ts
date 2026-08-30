import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { typingIndicatorPayload } from '../../../../supabase/functions/_shared/whatsappApiPayloads';

const apiSource = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/whatsappApi.ts'), 'utf8');

describe('WhatsApp typing indicator', () => {
  it('marks the exact incoming message read and requests the official text indicator', () => {
    expect(typingIndicatorPayload('wamid.test-123')).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.test-123',
      typing_indicator: { type: 'text' },
    });
  });

  it('uses the Graph version that supports typing indicators by default', () => {
    expect(apiSource).toContain("const DEFAULT_API_VERSION = 'v22.0'");
  });

  it('logs a safe status-only error if Meta rejects the typing indicator', () => {
    expect(apiSource).toContain('whatsapp typing indicator failed: ${res.status}');
  });
});
