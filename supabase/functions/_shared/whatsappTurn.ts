// Cross-invocation ordering for one WhatsApp identity.
//
// The webhook can be invoked more than once at the same time. This small
// wrapper keeps the database-specific lease calls in one place and makes the
// ordering rule explicit: an older pending/processing message must finish
// before a newer message starts.

type TurnDb = {
  from(table: string): any;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

const WAIT_MS = 250;
const MAX_WAIT_MS = 240_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForWhatsAppTurn(
  db: TurnDb,
  phone: string,
  messageId: string,
  ownerToken: string,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < MAX_WAIT_MS) {
    const { data: current } = await db.from('whatsapp_messages')
      .select('created_at')
      .eq('wa_message_id', messageId)
      .maybeSingle();
    const createdAt = current?.created_at;
    if (!createdAt) return false;

    const { data: earlier } = await db.from('whatsapp_messages')
      .select('id')
      .eq('phone_e164', phone)
      .in('status', ['pending', 'processing'])
      // Receipt images have their own worker queue and do not carry
      // conversation state; they must not hold a text turn behind them.
      .is('media_id', null)
      .lt('created_at', createdAt)
      .limit(1)
      .maybeSingle();
    if (earlier) {
      await sleep(WAIT_MS);
      continue;
    }

    const { data: acquired, error } = await db.rpc('wa_try_acquire_whatsapp_turn', {
      p_phone: phone,
      p_owner_token: ownerToken,
      p_lease_seconds: 300,
    });
    if (error) throw error;
    if (acquired === true) return true;
    await sleep(WAIT_MS);
  }
  return false;
}

export async function markWhatsAppTurnProcessing(
  db: TurnDb,
  messageId: string,
): Promise<void> {
  const { error } = await db.from('whatsapp_messages')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('wa_message_id', messageId)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function releaseWhatsAppTurn(
  db: TurnDb,
  phone: string,
  ownerToken: string,
): Promise<void> {
  const { error } = await db.rpc('wa_release_whatsapp_turn', {
    p_phone: phone,
    p_owner_token: ownerToken,
  });
  if (error) console.error('whatsapp turn release failed');
}

export function startWhatsAppTurnHeartbeat(
  db: TurnDb,
  phone: string,
  ownerToken: string,
): () => void {
  const timer = setInterval(() => {
    void db.rpc('wa_renew_whatsapp_turn', {
      p_phone: phone,
      p_owner_token: ownerToken,
      p_lease_seconds: 300,
    }).catch(() => undefined);
  }, 30_000);
  return () => clearInterval(timer);
}

export function turnQueueOrder<T extends { createdAt: string }>(messages: T[]): T[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
