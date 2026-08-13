import type { Lang } from './whatsappIntent.ts';

export type AiBudgetDecision = {
  allowed: boolean;
  reason?: string;
  resetAt: string;
};

const RISIP_TIME_ZONE = 'Africa/Dar_es_Salaam';

export function nextUtcBudgetReset(now = new Date()): string {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  )).toISOString();
}

export function normalizeAiBudgetDecision(
  data: unknown,
  error: unknown,
  now = new Date(),
): AiBudgetDecision {
  const value = data && typeof data === 'object' ? data as Record<string, unknown> : null;
  const suppliedReset = typeof value?.reset_at === 'string' ? new Date(value.reset_at) : null;
  const resetAt = suppliedReset && Number.isFinite(suppliedReset.getTime())
    ? suppliedReset.toISOString()
    : nextUtcBudgetReset(now);

  if (error || value?.allowed !== true) {
    return {
      allowed: false,
      reason: error ? 'budget_unavailable' : String(value?.reason ?? 'daily_limit'),
      resetAt,
    };
  }
  return { allowed: true, resetAt };
}

function localResetLabel(resetAt: string, lang: Lang): string {
  const reset = new Date(resetAt);
  const validReset = Number.isFinite(reset.getTime()) ? reset : new Date(nextUtcBudgetReset());
  const locale = lang === 'sw' ? 'sw-TZ' : 'en-TZ';
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: RISIP_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(validReset);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: RISIP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(validReset);
  return lang === 'sw'
    ? `${date} saa ${time} EAT`
    : `${date} at ${time} EAT`;
}

export function aiBudgetMessage(lang: Lang, resetAt: string, reason?: string): string {
  if (reason === 'budget_unavailable') {
    return lang === 'sw'
      ? 'Msaada wa AI haupatikani kwa muda mfupi. Amri za kawaida za Risip bado zinafanya kazi.'
      : 'AI assistance is temporarily unavailable. Risip’s standard commands are still working.';
  }

  const reset = localResetLabel(resetAt, lang);
  return lang === 'sw'
    ? `Umefikia kikomo cha msaada wa AI kwa sasa. Utaweza kutumia AI tena ${reset}. Amri za kawaida za Risip bado zinafanya kazi.`
    : `You have reached the current AI assistance limit. You can use AI again on ${reset}. Risip’s standard commands are still working.`;
}
