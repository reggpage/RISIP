import { describe, expect, it } from 'vitest';
import { typingIndicatorPayload } from '../../../../supabase/functions/_shared/whatsappApiPayloads';

describe('WhatsApp typing indicator', () => {
  it('marks the exact incoming message read and requests the official text indicator', () => {
    expect(typingIndicatorPayload('wamid.test-123')).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.test-123',
      typing_indicator: { type: 'text' },
    });
  });
});
