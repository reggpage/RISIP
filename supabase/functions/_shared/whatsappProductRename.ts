import type { Lang } from './whatsappIntent.ts';

export type ProductRenameRequest = { from: string; to: string };
export type ProductRenamePreview = ProductRenameRequest & {
  kind: 'product_rename_confirmation';
  records: number;
  saleLines: number;
  costRows: number;
  priceRows: number;
  stockCounts: number;
  unitRows: number;
};

const clean = (value: string | null | undefined) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function parseProductRename(text: string | null | undefined): ProductRenameRequest | null {
  const said = clean(text);
  const match = /^(?:badilisha\s+jina\s+la|rename)\s+(.+?)\s+(?:kuwa|to)\s+(.+)$/iu.exec(said);
  if (!match) return null;
  const from = clean(match[1]);
  const to = clean(match[2]);
  if (from.length < 2 || to.length < 2 || from.length > 100 || to.length > 100) return null;
  return { from, to };
}

export function productRenameConfirmation(preview: ProductRenamePreview, lang: Lang): string {
  return lang === 'sw'
    ? `Unataka kubadilisha jina la *${preview.from}* kuwa *${preview.to}*.\n`
      + `Rekodi ${preview.records.toLocaleString('en-US')} zitapewa jina jipya `
      + `(mauzo ${preview.saleLines}, gharama ${preview.costRows}, bei ${preview.priceRows}, stock ${preview.stockCounts}, vipimo ${preview.unitRows}).\n\n`
      + 'Pesa, idadi na jumla hazitabadilika. Audit itahifadhi jina la zamani.\nJibu *1* Ndiyo · *2* Hapana'
    : `Rename *${preview.from}* to *${preview.to}*.\n`
      + `${preview.records.toLocaleString('en-US')} records will receive the new name `
      + `(sales ${preview.saleLines}, costs ${preview.costRows}, prices ${preview.priceRows}, stock ${preview.stockCounts}, units ${preview.unitRows}).\n\n`
      + 'Money, quantities and totals will not change. The audit keeps the old name.\nReply *YES* or *NO*.';
}

export function productRenameSaved(preview: ProductRenamePreview, lang: Lang): string {
  return lang === 'sw'
    ? `✅ Jina limebadilishwa: ${preview.from} → ${preview.to}. Jumla hazijabadilika.`
    : `✅ Renamed: ${preview.from} → ${preview.to}. Totals are unchanged.`;
}

export function productRenameCancelled(lang: Lang): string {
  return lang === 'sw' ? 'Sawa, jina la bidhaa halijabadilishwa.' : 'Okay, the product name was not changed.';
}
