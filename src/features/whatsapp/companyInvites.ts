import { supabase } from '@/lib/supabase';
import type { LangCode } from '@/lib/lang';
import type { UserRole } from '@/types/db';

export type CompanyInviteRole = 'worker' | 'accountant';

export async function getActiveCompanyRole(): Promise<UserRole | null> {
  const { data, error } = await supabase.rpc('auth_role');
  if (error) return null;
  return (data as UserRole | null) ?? null;
}

export async function createCompanyInviteCode(
  role: CompanyInviteRole,
  days: number,
  maxUses: number,
): Promise<string> {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('Choose an expiry between 1 and 90 days.');
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) throw new Error('Maximum uses must be between 1 and 100.');

  const { data, error } = await supabase.rpc('create_company_invite_code', {
    p_role: role,
    p_days: days,
    p_max_uses: maxUses,
  });
  if (error) throw error;
  const code = String(data ?? '').trim();
  if (!code) throw new Error('Risip did not return an invite code.');
  return code;
}

export function risipWhatsAppStartUrl(): string | null {
  const number = String(import.meta.env.VITE_RISIP_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
  return number ? `https://wa.me/${number}?text=${encodeURIComponent('Hi')}` : null;
}

export function buildCompanyInviteShareText(input: {
  companyName: string;
  code: string;
  role: CompanyInviteRole;
  days: number;
  lang: LangCode;
  startUrl?: string | null;
}): string {
  const role = input.lang === 'sw'
    ? (input.role === 'accountant' ? 'Mhasibu' : 'Mfanyakazi')
    : (input.role === 'accountant' ? 'Accountant' : 'Worker');
  const link = input.startUrl ? `\n${input.startUrl}` : '';
  return input.lang === 'sw'
    ? `Umealikwa kujiunga na ${input.companyName || 'biashara'} kwenye Risip kama ${role}.\n\nTuma “Hi” kwa WhatsApp rasmi ya Risip, chagua “Jiunge na biashara niliyoalikwa”, kisha ingiza kodi:\n\n${input.code}\n\nKodi inaisha baada ya siku ${input.days}.${link}`
    : `You have been invited to join ${input.companyName || 'a business'} on Risip as ${role}.\n\nSend “Hi” to the official Risip WhatsApp number, choose “Join a business I was invited to”, then enter this code:\n\n${input.code}\n\nThe code expires after ${input.days} days.${link}`;
}
