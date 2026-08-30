import { describe, expect, it } from 'vitest';
import { whatsappTextPayload } from '../../../../supabase/functions/_shared/whatsappTextPayload';

describe('WhatsApp text payloads', () => {
  it('quotes the inbound bubble that triggered the reply', () => {
    expect(whatsappTextPayload('+255700000000', 'Jibu', { replyToMessageId: 'wamid.inbound-123' }))
      .toMatchObject({ context: { message_id: 'wamid.inbound-123' } });
  });

  it('omits context for ordinary proactive/system messages', () => {
    expect(whatsappTextPayload('+255700000000', 'Reminder')).not.toHaveProperty('context');
    expect(whatsappTextPayload('+255700000000', 'Reminder', { replyToMessageId: '   ' }))
      .not.toHaveProperty('context');
  });
});
