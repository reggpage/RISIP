import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, json } from '../_shared/cors.ts';
import { chatTransport, type ChatTransport } from '../_shared/chatTransport.ts';
import { sha256Hex } from '../_shared/whatsapp.ts';

type WebInput = NonNullable<ChatTransport['web']>;
export async function handleWebChat(req: Request, run: (input: WebInput) => Promise<Response>): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, { status: 405 });
  const authorization = req.headers.get('authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const userDb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: auth, error: authError } = await userDb.auth.getUser();
  if (authError || !auth.user) return json({ error: 'unauthorized' }, { status: 401 });
  let body: { id?: string; companyId?: string; text?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid_request' }, { status: 400 }); }
  if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000 ||
    typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) || typeof body.companyId !== 'string') {
    return json({ error: 'invalid_request' }, { status: 400 });
  }
  const { data: identityId, error: identityError } = await userDb.rpc('ensure_chat_identity');
  if (identityError || !identityId) return json({ error: 'inactive_membership' }, { status: 403 });
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: context, error: contextError } = await db.rpc('wa_resolve_context', { p_identity_id: identityId });
  if (contextError || context?.company_id !== body.companyId) return json({ error: 'business_changed' }, { status: 409 });
  const { data: identity, error: phoneError } = await db.from('whatsapp_identities').select('phone_e164').eq('id', identityId).single();
  if (phoneError) return json({ error: 'identity_unavailable' }, { status: 503 });
  const { data: lease, error: leaseError } = await db.from('whatsapp_turn_locks').select('lease_until').eq('phone_e164', `identity:${identityId}`).maybeSingle();
  if (leaseError) return json({ error: 'queue_unavailable' }, { status: 503 });
  // A dead isolate must not pin this identity's queue forever. Never replay its
  // writes automatically: preserve the original id and return its durable result.
  if (!lease || lease.lease_until < new Date().toISOString()) {
    const { error } = await db.from('whatsapp_messages').update({ status: 'failed', last_error: 'worker_ended_before_completion', processed_at: new Date().toISOString() })
      .eq('chat_identity_id', identityId).in('status', ['pending', 'processing']).lt('updated_at', new Date(Date.now() - 10 * 60000).toISOString());
    if (error) return json({ error: 'queue_unavailable' }, { status: 503 });
  }
  const messageId = `web:${auth.user.id}:${body.id}`;
  const { data: existing, error: replayError } = await db.from('whatsapp_messages').select('status, request_hash, company_id').eq('wa_message_id', messageId).maybeSingle();
  if (replayError) return json({ error: 'queue_unavailable' }, { status: 503 });
  if (existing) {
    if (existing.request_hash !== await sha256Hex(body.text.trim()) || existing.company_id !== body.companyId) return json({ error: 'id_conflict' }, { status: 409 });
    if (['pending', 'processing'].includes(existing.status)) return json({ pending: true }, { status: 202 });
    const { data: messages, error } = await db.from('chat_messages').select('*').eq('wa_message_id', messageId).eq('identity_id', identityId).order('ordinal');
    if (error) return json({ error: 'history_unavailable' }, { status: 503 });
    return json({ messages, status: existing.status, replayed: true });
  }
  const input: WebInput = { identityId, companyId: body.companyId, phone: identity?.phone_e164 ?? `web:${identityId}`, messageId, text: body.text.trim() };
  const encoder = new TextEncoder();
  let disconnected = false;
  const stream = new ReadableStream({
    start(controller) {
      const emit = (event: string, value: unknown) => {
        if (!disconnected) try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`)); } catch { disconnected = true; }
      };
      const heartbeat = setInterval(() => emit('heartbeat', {}), 15000);
      const work = chatTransport.run({ web: input, emit }, async () => {
        emit('accepted', { id: messageId });
        try {
          await run(input);
          const { data, error } = await db.from('whatsapp_messages').select('status').eq('wa_message_id', messageId).single();
          if (error || !data) emit('error', { error: 'processing_failed' });
          else if (['pending', 'processing'].includes(data.status)) emit('error', { error: 'pending' });
          else emit('done', { status: data?.status ?? 'failed' });
        } catch { emit('error', { error: 'processing_failed' }); }
        finally { clearInterval(heartbeat); if (!disconnected) controller.close(); }
      });
      // Browser disconnects do not cancel an accepted sale. Retry the same id.
      (globalThis as any).EdgeRuntime?.waitUntil(work);
    },
    cancel() { disconnected = true; },
  });
  return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
