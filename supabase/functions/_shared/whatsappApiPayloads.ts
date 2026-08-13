// Pure WhatsApp Cloud API request contracts. Kept outside whatsappApi.ts so
// browser-side unit tests can validate payloads without importing the Deno
// runtime or making a network call.

export function typingIndicatorPayload(messageId: string) {
  return {
    messaging_product: 'whatsapp' as const,
    status: 'read' as const,
    message_id: messageId,
    typing_indicator: { type: 'text' as const },
  };
}
