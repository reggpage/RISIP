import { describe, expect, it } from 'vitest';
import {
  parseProductRename,
  productRenameConfirmation,
} from '../../../../supabase/functions/_shared/whatsappProductRename';

describe('product rename conversation', () => {
  it('reads Swahili and English rename commands exactly', () => {
    expect(parseProductRename('badilisha jina la biblia kuwa Bibilia ndogo'))
      .toEqual({ from: 'biblia', to: 'Bibilia ndogo' });
    expect(parseProductRename('rename atlas to Atlasi'))
      .toEqual({ from: 'atlas', to: 'Atlasi' });
  });

  it('shows the number of affected records before confirmation', () => {
    const reply = productRenameConfirmation({
      kind: 'product_rename_confirmation', from: 'biblia', to: 'Bibilia ndogo',
      records: 12, saleLines: 4, costRows: 2, priceRows: 2, stockCounts: 3, unitRows: 1,
    }, 'sw');
    expect(reply).toContain('Rekodi 12');
    expect(reply).toContain('*1* Ndiyo');
    expect(reply).toContain('Pesa, idadi na jumla hazitabadilika');
  });
});
