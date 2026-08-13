import { describe, expect, it } from 'vitest';
import { buildKnowledgeReply, retrieveRisipKnowledge } from '../../../../supabase/functions/_shared/risipKnowledge';

describe('Risip knowledge retrieval', () => {
  it('retrieves daily-record guidance in Swahili', () => {
    const rows = retrieveRisipKnowledge('rekodi za mauzo na matumizi', 'sw');
    expect(rows.some((row) => row.topic === 'daily_records')).toBe(true);
    expect(buildKnowledgeReply('rekodi za mauzo', 'sw')).toContain('NDIYO');
  });

  it('retrieves permissions and receipt guidance in English', () => {
    expect(buildKnowledgeReply('worker permissions for receipt photo', 'en')).toContain('authorised project');
    expect(retrieveRisipKnowledge('worker permission', 'en')[0]?.topic).toBe('permissions');
  });

  it('does not expose a database or user-data action', () => {
    const reply = buildKnowledgeReply('help', 'sw');
    expect(reply).toContain('Risip');
    expect(reply).not.toMatch(/insert|update|delete|database/i);
  });

  it('explains registration, login-link security, and staff invitations', () => {
    expect(buildKnowledgeReply('nawezaje kujisajili akaunti', 'sw')).toContain('namba mpya');
    expect(buildKnowledgeReply('nipe login link ya dashboard', 'sw')).toContain('dakika 5');
    expect(buildKnowledgeReply('how do I invite a worker', 'en')).toContain('Settings → WhatsApp');
  });

  it('covers finance-control modules and states unsupported boundaries honestly', () => {
    expect(buildKnowledgeReply('retirement receipt reverse', 'en')).toContain('live retirement');
    expect(buildKnowledgeReply('supplier claim totals', 'en')).toContain('do not affect');
    expect(buildKnowledgeReply('stock on hand quantity', 'en')).toContain('does not yet');
    expect(buildKnowledgeReply('gharama ya bidhaa na faida', 'sw')).toContain('makisio');
  });
});
