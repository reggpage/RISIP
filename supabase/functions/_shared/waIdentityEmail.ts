// A WhatsApp-first account needs an auth user, and an auth user needs an
// identifier. It is deliberately NOT the phone.
//
// WHY NOT PHONE. Creating a user with { phone } requires GoTrue's phone provider,
// which is off on this project — measured, not assumed:
//     GET /auth/v1/settings  ->  "phone": false, "email": true
// Turning it on means configuring Twilio and paying per SMS, for a capability we
// would never use: Risip never sends an SMS. The messages go over WhatsApp.
//
// So the account is created against a synthetic address instead. The phone number
// still lives where it belongs — profiles.phone and whatsapp_identities.phone_e164
// — and the address exists only so GoTrue has a handle and so
// auth.admin.generateLink() has a real address attached to the user to work from.
//
// .invalid is reserved by RFC 2606 precisely for this: it can never resolve, so
// no mail can ever be sent here by accident, and nobody can later register the
// domain and start receiving our links.

/** `+255 700 000 103` -> `wa.255700000103@wa.invalid` */
export function waSyntheticEmail(phoneE164: string): string {
  const digits = (phoneE164 ?? '').replace(/\D/g, '');
  if (digits.length < 6) throw new Error('phone number too short to derive an identifier');
  return `wa.${digits}@wa.invalid`;
}

/** True for accounts created from WhatsApp, which have no real mailbox. */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.endsWith('@wa.invalid');
}
