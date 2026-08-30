// Pure WhatsApp Cloud API text payload builder.

export type WhatsAppTextPayloadOptions = {
  /** The inbound Meta message id that this response answers, if any. */
  replyToMessageId?: string | null;
};

export function whatsappTextPayload(
  to: string,
  body: string,
  options: WhatsAppTextPayloadOptions = {},
) {
  const replyTo = options.replyToMessageId?.trim();
  return {
    messaging_product: 'whatsapp' as const,
    recipient_type: 'individual' as const,
    to: to.replace(/^\+/, ''),
    type: 'text' as const,
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
    text: { preview_url: true, body },
  };
}
