/**
 * Checks the template contract immediately before a proactive send.
 *
 * Meta owns approval state. An AI may draft or repair a candidate, but it must
 * not decide that an unapproved template is safe to send.
 */

export type MetaTemplateComponent = { type?: string; text?: string };

export type MetaTemplate = {
  name?: string;
  status?: string;
  language?: string;
  components?: MetaTemplateComponent[];
};

export type WhatsAppTemplatePayload = {
  type?: string;
  template?: {
    name?: unknown;
    language?: { code?: unknown };
    components?: Array<{ type?: unknown; parameters?: unknown[] }>;
  };
};

export type TemplateCheckResult =
  | { ok: true; template: MetaTemplate }
  | {
    ok: false;
    reason: 'invalid_payload' | 'not_found' | 'not_approved' | 'language_mismatch'
      | 'parameter_count_mismatch' | 'template_contract_invalid';
    templateName: string;
    language: string;
    expectedParameters?: number;
    actualParameters?: number;
  };

type RegistryResponse = { data?: MetaTemplate[]; paging?: { next?: string } };

const REGISTRY_TTL_MS = 5 * 60 * 1000;
let registryCache: { key: string; expiresAt: number; templates: MetaTemplate[] } | null = null;
let wabaIdCache: { phoneNumberId: string; id: string } | null = null;

const normal = (value: unknown) => String(value ?? '').trim();
const componentType = (value: unknown) => normal(value).toUpperCase();

function bodyVariableCount(text: string): number | null {
  const indexes = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  if (indexes.length === 0) return 0;
  const unique = [...new Set(indexes)].sort((a, b) => a - b);
  return unique.every((value, index) => value === index + 1) ? unique.length : null;
}

function expectedBodyParameters(template: MetaTemplate): number | null {
  const body = (template.components ?? []).find((item) => componentType(item.type) === 'BODY');
  return body ? bodyVariableCount(normal(body.text)) : null;
}

/** Pure check used by the sender and by unit tests. */
export function checkWhatsAppTemplate(
  payload: WhatsAppTemplatePayload,
  templates: MetaTemplate[],
): TemplateCheckResult {
  const template = payload.template;
  const templateName = normal(template?.name);
  const language = normal(template?.language?.code);
  const actualParameters = (template?.components ?? [])
    .filter((component) => componentType(component.type) === 'BODY')
    .reduce((sum, component) => sum + (Array.isArray(component.parameters) ? component.parameters.length : 0), 0);

  if (payload.type !== 'template' || !templateName || !language) {
    return { ok: false, reason: 'invalid_payload', templateName, language };
  }
  const sameName = templates.filter((item) => normal(item.name) === templateName);
  if (sameName.length === 0) return { ok: false, reason: 'not_found', templateName, language };
  const translation = sameName.find((item) => normal(item.language) === language);
  if (!translation) return { ok: false, reason: 'language_mismatch', templateName, language };
  if (normal(translation.status).toUpperCase() !== 'APPROVED') {
    return { ok: false, reason: 'not_approved', templateName, language };
  }
  const expectedParameters = expectedBodyParameters(translation);
  if (expectedParameters == null) {
    return { ok: false, reason: 'template_contract_invalid', templateName, language };
  }
  if (actualParameters !== expectedParameters) {
    return {
      ok: false,
      reason: 'parameter_count_mismatch',
      templateName,
      language,
      expectedParameters,
      actualParameters,
    };
  }
  return { ok: true, template: translation };
}

function apiBase(apiVersion: string): string {
  return `https://graph.facebook.com/${apiVersion}`;
}

async function resolveWabaId(options: {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}): Promise<string> {
  const den = (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno;
  const configured = normal(den?.env?.get('WHATSAPP_BUSINESS_ACCOUNT_ID'));
  if (configured) return configured;
  if (wabaIdCache?.phoneNumberId === options.phoneNumberId) return wabaIdCache.id;
  const response = await fetch(
    `${apiBase(options.apiVersion)}/${encodeURIComponent(options.phoneNumberId)}?fields=whatsapp_business_account`,
    { headers: { authorization: `Bearer ${options.accessToken}` } },
  );
  if (!response.ok) throw new Error(`whatsapp_template_registry_waba_${response.status}`);
  const body = await response.json() as { whatsapp_business_account?: { id?: string } };
  const id = normal(body.whatsapp_business_account?.id);
  if (!id) throw new Error('whatsapp_template_registry_waba_missing');
  wabaIdCache = { phoneNumberId: options.phoneNumberId, id };
  return id;
}

/** Fetch Meta's current inventory, following a bounded number of pages. */
export async function fetchWhatsAppTemplates(options: {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}): Promise<MetaTemplate[]> {
  const wabaId = await resolveWabaId(options);
  const cacheKey = `${wabaId}:${options.apiVersion}`;
  if (registryCache && registryCache.key === cacheKey && registryCache.expiresAt > Date.now()) {
    return registryCache.templates;
  }
  const templates: MetaTemplate[] = [];
  let url = `${apiBase(options.apiVersion)}/${encodeURIComponent(wabaId)}/message_templates`
    + '?fields=name,status,language,components&limit=100';
  for (let page = 0; page < 5 && url; page += 1) {
    const response = await fetch(url, { headers: { authorization: `Bearer ${options.accessToken}` } });
    if (!response.ok) throw new Error(`whatsapp_template_registry_fetch_${response.status}`);
    const body = await response.json() as RegistryResponse;
    templates.push(...(body.data ?? []));
    url = normal(body.paging?.next);
  }
  registryCache = { key: cacheKey, expiresAt: Date.now() + REGISTRY_TTL_MS, templates };
  return templates;
}

/** Fail closed before Meta's /messages endpoint is called. */
export async function assertApprovedWhatsAppTemplate(
  payload: WhatsAppTemplatePayload,
  options: { accessToken: string; phoneNumberId: string; apiVersion: string },
): Promise<void> {
  const result = checkWhatsAppTemplate(payload, await fetchWhatsAppTemplates(options));
  if (!result.ok) throw new Error(`whatsapp_template_${result.reason}`);
}

export function clearWhatsAppTemplateRegistryCache(): void {
  registryCache = null;
  wabaIdCache = null;
}
