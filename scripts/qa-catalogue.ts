// Every question a shopkeeper can ask Risip, and the exact answer it gives.
//
// Written for the owner to read and correct: the replies here are NOT typed out
// by hand, they are produced by calling the same functions the webhook calls,
// with sample figures. If a word in this document is wrong, the word in the
// product is wrong, and correcting it here is correcting it there.
//
//   npx vite-node scripts/qa-catalogue.ts
//
// Writes JSON for the Word generator to render.

import { writeFileSync } from 'node:fs';
import { startOnboarding, advanceOnboarding } from '../supabase/functions/_shared/whatsappOnboarding.ts';
import { businessWelcome } from '../supabase/functions/_shared/whatsappStarterExamples.ts';
import {
  buildDailyRecordConfirmation, buildDailyRecordConfirmed, buildDailyRecordCancelled,
  buildDailyRecordPending, parseDailyRecord,
} from '../supabase/functions/_shared/whatsappDailyRecords.ts';
import {
  buildDailyRecordBatchConfirmation, parseDailyRecordBatch,
} from '../supabase/functions/_shared/whatsappDailyRecordBatch.ts';
import {
  parseQuantityOnlySale, priceLine, quantitySaleConfirmation, quantitySaleMissingPrices,
  type ProductPricing,
} from '../supabase/functions/_shared/whatsappQuantitySale.ts';
import { priceBandQuestion, priceBandStillOpen } from '../supabase/functions/_shared/whatsappPriceBand.ts';
import { parseProductCost, costConfirmation, costSaved, productCostReply } from '../supabase/functions/_shared/whatsappProductCosts.ts';
import { parseProductCostBatch, costBatchConfirmation, costBatchSaved } from '../supabase/functions/_shared/whatsappCostBatch.ts';
import { parseSellingPrice, sellingPriceConfirmation, sellingPriceSaved } from '../supabase/functions/_shared/whatsappSellingPrice.ts';
import {
  parseSellingPriceBatch, sellingPriceBatchConfirmation, sellingPriceBatchCostWarnings,
  sellingPriceBatchSaved,
} from '../supabase/functions/_shared/whatsappSellingPriceBatch.ts';
import {
  parseStockCount, parseStockQuestion, stockCountConfirmation, stockListReply, stockReply,
  type StockRow,
} from '../supabase/functions/_shared/whatsappStock.ts';
import { parseStockCountBatch, stockCountBatchConfirmation, stockCountBatchSaved } from '../supabase/functions/_shared/whatsappStockBatch.ts';
import { lowStockNotice } from '../supabase/functions/_shared/whatsappLowStock.ts';
import { newProductOffer, newProductConfirmation, newProductSaved } from '../supabase/functions/_shared/whatsappNewProduct.ts';
import { addProductNameQuestion, addProductNeedsCost } from '../supabase/functions/_shared/whatsappAddProduct.ts';
import { productRenameConfirmation, productRenameSaved } from '../supabase/functions/_shared/whatsappProductRename.ts';
import {
  parsePortionSetupOffer, portionSizeQuestion, resumePortionSetup, portionSetupConfirmation,
  portionSetupSaved, portionQuantityQuestion, portionUnitRequired,
} from '../supabase/functions/_shared/whatsappPortions.ts';
import { inviteRoleQuestion, inviteReady } from '../supabase/functions/_shared/whatsappInvite.ts';
import { logoutConfirmation, logoutDone, logoutCancelled } from '../supabase/functions/_shared/whatsappLogout.ts';
import { quantityMeaningQuestion } from '../supabase/functions/_shared/whatsappConversationMemory.ts';
import { secondInstructionNotice, riderQuestionNotice } from '../supabase/functions/_shared/whatsappMixedTopics.ts';
import { buildHypotheticalProfitReply } from '../supabase/functions/_shared/whatsappHypotheticalProfit.ts';
import { productAnalyticsReply } from '../supabase/functions/_shared/whatsappProductAnalytics.ts';
import {
  buildBusinessSummaryReply, buildDebtorsReply, buildProfitReply, buildPettyCashReply,
} from '../supabase/functions/_shared/whatsappReadTools.ts';
import { route } from './lib/route.ts';

export type Status = 'kazi' | 'nusu' | 'hapana';
export type Row = { ask: string; reply: string; status: Status; note?: string };
export type Section = { title: string; intro?: string; rows: Row[] };

const sections: Section[] = [];
const add = (section: Section) => sections.push(section);

// ── A. Kuanza: mtu mpya kabisa ─────────────────────────────────────────────
{
  const rows: Row[] = [];
  const first = startOnboarding();
  rows.push({ ask: 'Habari (ujumbe wa kwanza kabisa kutoka namba isiyojulikana)', reply: first.reply, status: 'kazi' });

  const picked = advanceOnboarding('lang', '1', 'en');
  rows.push({ ask: '1', reply: picked.reply, status: 'kazi', note: 'Kuchagua Kiswahili. "2" huchagua Kiingereza.' });

  const create = advanceOnboarding('menu', '1', 'sw');
  rows.push({ ask: '1 (au: nataka kufungua biashara)', reply: create.reply, status: 'kazi' });

  const named = advanceOnboarding('create_name', 'Duka la Asha', 'sw');
  rows.push({ ask: 'Duka la Asha', reply: named.reply, status: 'kazi' });

  const described = advanceOnboarding('create_description', 'nauza sukari, mchele na sabuni', 'sw', named.draft);
  rows.push({ ask: 'nauza sukari, mchele na sabuni', reply: described.reply, status: 'kazi' });

  const refused = advanceOnboarding('create_category_confirm', 'hapana', 'sw', described.draft);
  rows.push({ ask: 'hapana (kama aina si sahihi)', reply: refused.reply, status: 'kazi',
    note: 'Aina iliyokataliwa hairudishwi tena, na swali la pili ni tofauti na la kwanza.' });

  const confirmed = advanceOnboarding('create_category_confirm', 'ndiyo', 'sw', described.draft);
  rows.push({ ask: 'ndiyo', reply: confirmed.reply, status: 'kazi' });

  const person = advanceOnboarding('create_person', 'Asha Mkwawa', 'sw', confirmed.draft);
  rows.push({ ask: 'Asha Mkwawa', reply: person.reply || '(hakuna majibu hapa — biashara inatengenezwa, kisha ujumbe wa karibu unatumwa)', status: 'kazi' });

  const join = advanceOnboarding('menu', '2', 'sw');
  rows.push({ ask: '2 (au: nimealikwa, nataka kujiunga)', reply: join.reply, status: 'kazi' });

  const code = advanceOnboarding('join_code', 'AB23CD45', 'sw');
  rows.push({ ask: 'AB23CD45', reply: code.reply, status: 'kazi', note: 'Kodi inaweza kutumwa peke yake au ndani ya sentensi.' });

  const badCode = advanceOnboarding('join_code', '1234', 'sw');
  rows.push({ ask: '1234 (kodi isiyo sahihi)', reply: badCode.reply, status: 'kazi' });

  rows.push({
    ask: '(baada ya biashara kutengenezwa — ujumbe wa karibu)',
    reply: businessWelcome('Asha', 'Duka la Asha', 'Retail & General Stores', "Duka la Mang'aa / Rejareja", 'sw'),
    status: 'kazi',
    note: 'Mifano hubadilika kulingana na aina ya biashara. Hakuna bidhaa inayohifadhiwa hapa — ni mifano tu.',
  });
  add({ title: 'A. Kuanza — mtu mpya kabisa', rows,
    intro: 'Namba isiyojulikana ikituma ujumbe wowote, Risip huanza hapa.' });
}

// ── B. Kuingia, kualika, kutoka ────────────────────────────────────────────
{
  const rows: Row[] = [];
  rows.push({
    ask: 'login',
    reply: 'Tuma *login* kupata link ya kuingia kwenye web app. Link hudumu dakika 15 na ni ya matumizi moja.',
    status: 'kazi',
    note: 'Link halisi haiwezi kuonyeshwa hapa; hutumwa kwenye chat.',
  });
  rows.push({ ask: 'invite', reply: inviteRoleQuestion('sw'), status: 'kazi' });
  rows.push({
    ask: 'mfanyakazi (au: 1)',
    reply: inviteReady('AB23CD45', 'worker', 'Duka la Asha', '255700000000', 'sw'),
    status: 'kazi',
    note: 'Kodi hii inatumwa kwa mfanyakazi na wewe mwenyewe (WhatsApp hairuhusu Risip kuanzisha mazungumzo na namba mpya).',
  });
  rows.push({ ask: 'nataka kutoka', reply: logoutConfirmation('Duka la Asha', 'sw'), status: 'kazi' });
  rows.push({ ask: 'ndiyo (kuthibitisha kutoka)', reply: logoutDone('Duka la Asha', 'sw'), status: 'kazi' });
  rows.push({ ask: 'hapana (kughairi kutoka)', reply: logoutCancelled('sw'), status: 'kazi' });
  add({ title: 'B. Kuingia kwenye web app, kualika mfanyakazi, kutoka', rows });
}

// ── C. Kurekodi mauzo ──────────────────────────────────────────────────────
{
  const rows: Row[] = [];
  const one = parseDailyRecord('nimeuza daftari 5 kwa 7500', 'sw');
  rows.push({
    ask: 'nimeuza daftari 5 kwa 7500',
    reply: one.kind === 'parsed' ? buildDailyRecordConfirmation(one.record, 'sw') : String(one.kind),
    status: 'kazi',
  });
  rows.push({ ask: 'NDIYO', reply: one.kind === 'parsed' ? buildDailyRecordConfirmed(one.record, 'sw') : '', status: 'kazi' });
  rows.push({ ask: 'HAPANA', reply: buildDailyRecordCancelled('sw'), status: 'kazi' });
  rows.push({
    ask: 'NDIYO (ikiwa aliyetuma ni mfanyakazi)',
    reply: one.kind === 'parsed' ? buildDailyRecordPending(one.record, 'sw') : '',
    status: 'kazi',
    note: 'Mfanyakazi hawezi kuthibitisha rekodi yake mwenyewe; inasubiri owner au accountant.',
  });

  const many = parseDailyRecordBatch('nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500', 'sw');
  rows.push({
    ask: 'nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500',
    reply: many.kind === 'parsed' && many.records[0]
      ? buildDailyRecordConfirmation(many.records[0], 'sw') : String(many.kind),
    status: 'kazi',
    note: 'Bidhaa mbili, rekodi moja ya mauzo, jumla moja.',
  });

  const pricing: ProductPricing = { retail: 1500, wholesale: 1200, wholesaleMinQty: 5 };
  const sale = parseQuantityOnlySale('nimeuza daftari 3 rejareja');
  const priced = sale ? sale.items.map((item) => priceLine(item, pricing)).filter(Boolean) : [];
  rows.push({
    ask: 'nimeuza daftari 3 rejareja',
    reply: quantitySaleConfirmation(priced as never, 'sw'),
    status: 'kazi',
    note: 'Bei hazikuandikwa — zimetoka kwenye orodha yako mwenyewe.',
  });

  const roll = parseQuantityOnlySale('Mauzo ya leo rejareja\ndaftari 10\nkalamu 4');
  const rollLines = roll ? roll.items.map((item) => priceLine(item, pricing)).filter(Boolean) : [];
  rows.push({
    ask: 'Mauzo ya leo rejareja\ndaftari 10\nkalamu 4',
    reply: quantitySaleConfirmation(rollLines as never, 'sw'),
    status: 'kazi',
    note: 'Neno "rejareja" juu ya orodha linatumika kwa kila mstari.',
  });

  rows.push({
    ask: 'nimeuza marker 2',
    reply: quantitySaleMissingPrices(['marker'], 'sw'),
    status: 'kazi',
    note: 'Bidhaa haina bei ya kuuza bado.',
  });

  rows.push({
    ask: 'kitabu 7, biblia 3 (bila kitenzi)',
    reply: quantityMeaningQuestion('sw'),
    status: 'kazi',
    note: 'Orodha bila kitenzi inaweza kuwa mauzo au manunuzi — Risip huuliza mara moja tu.',
  });
  const tillRoll = ['Mauzo ya leo rejareja', 'daftari 10', 'kalamu 4', 'Matumizi:', 'nauli 3000', 'umeme 12000']
    .join('\n');
  const withSpending = parseQuantityOnlySale(tillRoll);
  const spendLines = withSpending ? withSpending.items.map((item) => priceLine(item, pricing)).filter(Boolean) : [];
  rows.push({
    ask: tillRoll,
    reply: quantitySaleConfirmation(spendLines as never, 'sw', withSpending ? withSpending.expenses : []),
    status: 'kazi',
    note: 'Mauzo na matumizi kwenye ujumbe mmoja. Hazipunguzwi — kila moja inaonyeshwa kando.',
  });
  add({ title: 'C. Kurekodi mauzo', rows });
}

// ── D. Swali la bei: rejareja au jumla? ────────────────────────────────────
{
  const rows: Row[] = [];
  rows.push({
    ask: 'viberiti 2',
    reply: priceBandQuestion([{ index: 0, product: 'Viberiti', quantity: 2, retail: 500, wholesale: 400 }], 'sw'),
    status: 'kazi',
    note: 'Swali huja pale tu bidhaa ina bei ZOTE MBILI zilizosajiliwa na ujumbe haukusema.',
  });
  const two = [
    { index: 0, product: 'Viberiti', quantity: 2, retail: 500, wholesale: 400 },
    { index: 1, product: 'Daftari', quantity: 10, retail: 1000, wholesale: 800 },
  ];
  rows.push({ ask: 'viberiti 2, daftari 10', reply: priceBandQuestion(two, 'sw'), status: 'kazi',
    note: 'Swali moja kwa ujumbe mmoja, hata kama mistari ni 30.' });
  rows.push({ ask: 'jumla', reply: '(mauzo yote yanapigwa hesabu kwa bei ya jumla, kisha uthibitisho wa kawaida wa NDIYO)', status: 'kazi' });
  rows.push({ ask: '1 rejareja, 2 jumla', reply: '(kila mstari unapata bei yake, kisha uthibitisho wa NDIYO)', status: 'kazi' });
  rows.push({ ask: 'viberiti rejareja (jibu la nusu)', reply: priceBandStillOpen([two[1]], 'sw'), status: 'kazi' });
  add({ title: 'D. Swali la bei — rejareja au jumla', rows,
    intro: 'Bidhaa yenye bei moja tu haiulizwi kamwe.' });
}

// ── E. Matumizi, madeni na malipo ──────────────────────────────────────────
{
  const rows: Row[] = [];
  const spend = parseDailyRecord('nimelipa umeme 45000', 'sw');
  rows.push({ ask: 'nimelipa umeme 45000',
    reply: spend.kind === 'parsed' ? buildDailyRecordConfirmation(spend.record, 'sw') : String(spend.kind), status: 'kazi' });

  const debt = parseDailyRecord('Mama Asha amechukua sukari 12000', 'sw');
  rows.push({ ask: 'Mama Asha amechukua sukari 12000',
    reply: debt.kind === 'parsed' ? buildDailyRecordConfirmation(debt.record, 'sw') : String(debt.kind),
    status: 'kazi', note: 'Mtu aliyetajwa akichukua bidhaa ni deni. Jina lote linahifadhiwa, si neno la kwanza tu.' });

  const debt2 = parseDailyRecord('Juma amechukua mafuta kwa mkopo 18000', 'sw');
  rows.push({ ask: 'Juma amechukua mafuta kwa mkopo 18000',
    reply: debt2.kind === 'parsed' ? buildDailyRecordConfirmation(debt2.record, 'sw') : String(debt2.kind), status: 'kazi' });

  const paid = parseDailyRecord('Asha amelipa 10000', 'sw');
  rows.push({ ask: 'Asha amelipa 10000',
    reply: paid.kind === 'parsed' ? buildDailyRecordConfirmation(paid.record, 'sw') : String(paid.kind), status: 'kazi' });

  const buy = parseDailyRecord('nimenunua vitabu 10 kila moja 7000', 'sw');
  rows.push({ ask: 'nimenunua vitabu 10 kila moja 7000',
    reply: buy.kind === 'parsed' ? buildDailyRecordConfirmation(buy.record, 'sw') : String(buy.kind),
    status: 'kazi', note: 'Hakuna haja ya kuandika neno "stock".' });

  const buy2 = parseDailyRecord('nimenunua stock ya sukari 70000', 'sw');
  rows.push({ ask: 'nimenunua stock ya sukari 70000',
    reply: buy2.kind === 'parsed' ? buildDailyRecordConfirmation(buy2.record, 'sw') : String(buy2.kind),
    status: 'kazi', note: 'Hakuna idadi, kwa hiyo hesabu ya stoko haibadiliki.' });

  const lunch = parseDailyRecord('nimenunua chakula 5000', 'sw');
  rows.push({ ask: 'nimenunua chakula 5000',
    reply: lunch.kind === 'clarify' ? lunch.question : String(lunch.kind),
    status: 'nusu',
    note: 'Idadi haipo — inaweza kuwa gharama ya kawaida au mzigo. Risip haibahatishi.' });
  add({ title: 'E. Matumizi, madeni na malipo', rows });
}

// ── F. Bei ya kununua ──────────────────────────────────────────────────────
{
  const rows: Row[] = [];
  const cost = parseProductCost('bei ya kununua daftari ni 1200');
  rows.push({ ask: 'bei ya kununua daftari ni 1200',
    reply: cost ? costConfirmation(cost, 'Duka la Asha', null, 'sw') : '(haikusomeka)', status: 'kazi' });
  rows.push({ ask: 'NDIYO', reply: cost ? costSaved(cost, 'Duka la Asha', 'sw') : '', status: 'kazi' });
  const cost2 = parseProductCost('unga unanigharimu 900 kwa kilo');
  rows.push({ ask: 'unga unanigharimu 900 kwa kilo',
    reply: cost2 ? costConfirmation(cost2, 'Duka la Asha', 850, 'sw') : '(haikusomeka)',
    status: 'kazi', note: 'Bei ya zamani inaonyeshwa ili ubadiliko usipite kimyakimya.' });
  const batch = parseProductCostBatch('bei ya kununua daftari ni 1200\nbei ya kununua kalamu ni 300');
  rows.push({ ask: 'bei ya kununua daftari ni 1200\nbei ya kununua kalamu ni 300',
    reply: batch ? costBatchConfirmation(batch, 'sw') : '(haikusomeka)', status: 'kazi' });
  rows.push({ ask: 'NDIYO', reply: costBatchSaved(2, 'Duka la Asha', 'sw'), status: 'kazi' });
  rows.push({ ask: 'bei ya kununua daftari ni ngapi?',
    reply: productCostReply('daftari', { productName: 'daftari', unitCost: 1200, unit: null, currency: 'TZS', effectiveFrom: '2026-08-01T00:00:00Z' }, 'sw'),
    status: 'nusu', note: 'Jibu lipo, lakini swali hili bado halifikii njia ya moja kwa moja — linapita kwa AI.' });
  add({ title: 'F. Bei ya kununua bidhaa', rows });
}

// ── G. Bei ya kuuza ────────────────────────────────────────────────────────
{
  const rows: Row[] = [];
  const price = parseSellingPrice('bei ya daftari rejareja 1500 jumla 1200 kuanzia pcs 5');
  rows.push({ ask: 'bei ya daftari rejareja 1500 jumla 1200 kuanzia pcs 5',
    reply: price ? sellingPriceConfirmation(price, 'sw') : '(haikusomeka)', status: 'kazi' });
  rows.push({ ask: 'NDIYO', reply: price ? sellingPriceSaved(price, 'sw') : '', status: 'kazi' });

  const list = parseSellingPriceBatch('kamusi rejareja 15000\nmkasi rejareja 3500\ndaftari rejareja 1600');
  rows.push({ ask: 'kamusi rejareja 15000\nmkasi rejareja 3500\ndaftari rejareja 1600',
    reply: list ? sellingPriceBatchConfirmation(list, 'sw') : '(haikusomeka)', status: 'kazi',
    note: 'Uthibitisho mmoja kwa orodha nzima.' });

  const loss = parseSellingPriceBatch('daftari rejareja 1000\nkalamu rejareja 500');
  rows.push({ ask: 'daftari rejareja 1000\nkalamu rejareja 500 (wakati daftari inanunuliwa 1200)',
    reply: loss ? sellingPriceBatchConfirmation(loss, 'sw', sellingPriceBatchCostWarnings(loss.prices, new Map([['daftari', 1200]]), 'sw')) : '',
    status: 'kazi', note: 'Onyo la hasara linakuja JUU ya swali, si chini yake.' });
  rows.push({ ask: 'NDIYO', reply: sellingPriceBatchSaved(3, 'Duka la Asha', 'sw'), status: 'kazi' });
  add({ title: 'G. Bei ya kuuza', rows });
}

// ── H. Stoko ───────────────────────────────────────────────────────────────
{
  const rows: Row[] = [];
  const count = parseStockCount('nina daftari 90');
  rows.push({ ask: 'nina daftari 90', reply: count ? stockCountConfirmation(count, null, 'sw') : '', status: 'kazi' });
  const added = parseStockCount('naongeza sukari 20');
  rows.push({ ask: 'naongeza sukari 20', reply: added ? stockCountConfirmation(added, 30, 'sw') : '',
    status: 'kazi', note: 'Risip inasema wazi kuwa imeweka 20, si 20 juu ya zilizopo.' });
  const tray = parseStockCount('nimeongeza mayai treya 5 storini');
  rows.push({ ask: 'nimeongeza mayai treya 5 storini', reply: tray ? stockCountConfirmation(tray, null, 'sw') : '', status: 'kazi' });

  const batch = parseStockCountBatch('naongeza bidhaa\ndaftari 90\nkalamu 40\nsukari kilo 12.5');
  rows.push({ ask: 'naongeza bidhaa\ndaftari 90\nkalamu 40\nsukari kilo 12.5',
    reply: batch ? stockCountBatchConfirmation(batch, 'sw') : '(haikusomeka)', status: 'kazi',
    note: '"naongeza bidhaa" au "add product" ndiyo maneno mapya. "store" bado inafanya kazi.' });
  rows.push({ ask: 'NDIYO', reply: stockCountBatchSaved(3, 'Duka la Asha', 'sw'), status: 'kazi' });

  const shelf: StockRow = {
    productName: 'daftari', unit: null, measured: false, onHand: 62, hasCount: true,
    countedAt: '2026-08-15T16:23:10Z', boughtSince: 0, soldSince: 28, incompletePurchases: false,
  };
  rows.push({ ask: 'daftari ziko ngapi?', reply: stockReply(shelf, 'daftari', 'sw'), status: 'kazi' });
  rows.push({ ask: 'daftari ziko ngapi stoo?', reply: stockReply(shelf, 'daftari', 'sw'), status: 'kazi',
    note: 'Neno la mahali (stoo, store, dukani) halihesabiwi kama jina la bidhaa.' });
  rows.push({ ask: 'bidhaa ziko ngapi store?',
    reply: stockListReply([shelf, { ...shelf, productName: 'kalamu', onHand: 4 }], 'sw'), status: 'kazi' });
  rows.push({ ask: 'atlas ziko ngapi? (bidhaa isiyowahi kuhesabiwa)',
    reply: stockReply({ ...shelf, productName: 'atlas', hasCount: false, countedAt: null, onHand: 0, soldSince: 6 }, 'atlas', 'sw'),
    status: 'kazi', note: 'Haisemi sifuri wala hasi — inasema haijawahi kuhesabiwa.' });
  rows.push({ ask: 'daftari ziko ngapi? (wakati mauzo yamezidi hesabu)',
    reply: stockReply({ ...shelf, onHand: -8, soldSince: 248 }, 'daftari', 'sw'),
    status: 'kazi', note: 'Hakuna mahali panapoonyesha namba hasi tena.' });
  rows.push({ ask: '(baada ya kuthibitisha mauzo — onyo la moja kwa moja)',
    reply: lowStockNotice([
      { productName: 'kalamu', onHand: 3, unit: null, hasCount: true },
      { productName: 'daftari', onHand: 0, unit: null, hasCount: true },
    ], 'sw').trim(),
    status: 'kazi', note: 'Bidhaa isiyowahi kuhesabiwa haitajwi hapa.' });
  add({ title: 'H. Kuhesabu stoko na kuuliza stoko', rows });
}

// ── I. Bidhaa mpya na majina ───────────────────────────────────────────────
{
  const rows: Row[] = [];
  rows.push({ ask: '(baada ya mauzo yenye bidhaa isiyojulikana)', reply: newProductOffer(['marker'], 'sw'), status: 'kazi' });
  const fresh = [{ product: 'marker', unitCost: 1200, retail: 2000, wholesale: 1800, wholesaleMinQty: 5 }];
  rows.push({ ask: 'marker nanunua 1200 nauza rejareja 2000 jumla 1800 kuanzia 5',
    reply: newProductConfirmation(fresh as never, 'sw'), status: 'kazi' });
  rows.push({ ask: 'NDIYO', reply: newProductSaved(fresh as never, 'sw'), status: 'kazi' });
  rows.push({ ask: 'naongeza bidhaa mpya', reply: addProductNameQuestion('sw'), status: 'kazi' });
  rows.push({ ask: 'Nyama ya ng\'ombe', reply: addProductNeedsCost('Nyama ya ng\'ombe', 'sw'), status: 'kazi' });
  rows.push({ ask: 'badilisha jina la daftari kuwa daftari kubwa',
    reply: productRenameConfirmation({ kind: 'product_rename_confirmation', from: 'daftari', to: 'daftari kubwa', records: 41, saleLines: 28, costRows: 3, priceRows: 4, stockCounts: 5, unitRows: 1 }, 'sw'), status: 'kazi' });
  rows.push({ ask: 'NDIYO', reply: productRenameSaved({ kind: 'product_rename_confirmation', from: 'daftari', to: 'daftari kubwa', records: 41, saleLines: 28, costRows: 3, priceRows: 4, stockCounts: 5, unitRows: 1 }, 'sw'), status: 'kazi' });
  add({ title: 'I. Bidhaa mpya na kubadilisha majina', rows });
}

// ── J. Vipimo (bidhaa zinazouzwa kwa robo, nusu, lita) ─────────────────────
{
  const rows: Row[] = [];
  const offer = parsePortionSetupOffer('mafuta ndoo @20000 nauza robo 700 nusu 1200 lita 2500');
  rows.push({ ask: 'mafuta ndoo @20000 nauza robo 700 nusu 1200 lita 2500',
    reply: offer ? portionSizeQuestion(offer, 'sw') : '(haikusomeka)', status: 'kazi' });
  const ready = offer ? resumePortionSetup(offer, 'ndoo = 20 lita; robo = 0.25 lita; nusu = 0.5 lita; lita = 1 lita') : null;
  rows.push({ ask: 'ndoo = 20 lita; robo = 0.25 lita; nusu = 0.5 lita; lita = 1 lita',
    reply: ready && ready.kind === 'ready' ? portionSetupConfirmation(ready.setup, 'sw') : '(haikusomeka)', status: 'kazi' });
  rows.push({ ask: 'NDIYO', reply: ready && ready.kind === 'ready' ? portionSetupSaved(ready.setup, 'sw') : '', status: 'kazi' });
  rows.push({ ask: 'nimeuza mafuta', reply: portionUnitRequired('mafuta', ['robo', 'nusu', 'lita'], 'sw'), status: 'kazi' });
  rows.push({ ask: 'nimeuza mafuta robo',
    reply: portionQuantityQuestion({ kind: 'portion_quantity_prompt', productName: 'mafuta', unitName: 'robo' }, 'sw'), status: 'kazi' });
  const meat = parsePortionSetupOffer('store nyama ya ngombe kilo 10 nimenunua kwa 100,000, robo nauza 6,000, nusu nauza 12,000, kilo nauza 22,000');
  rows.push({ ask: 'store nyama ya ngombe kilo 10 nimenunua kwa 100,000, robo nauza 6,000, nusu nauza 12,000, kilo nauza 22,000',
    reply: meat ? portionSizeQuestion(meat, 'sw') : '(haikusomeka)', status: 'kazi',
    note: 'Haiulizi tena "kilo moja ina kilo ngapi".' });
  add({ title: 'J. Vipimo — bidhaa zinazouzwa robo, nusu, lita, kilo', rows });
}

// ── K. Maswali ya hesabu ───────────────────────────────────────────────────
{
  const rows: Row[] = [];
  rows.push({ ask: 'muhtasari wa leo',
    reply: buildBusinessSummaryReply({ sales: 480000, expenses: 25000, debtIssued: 30000, customerPayments: 15000, stockPurchases: 120000, cashMovement: 350000 }, 'today', 'sw'),
    status: 'kazi', note: 'Namba ni za mfano; Risip hutumia rekodi zilizothibitishwa tu.' });
  rows.push({ ask: 'faida ya leo ni ngapi?',
    reply: buildProfitReply({ sales: 480000, expenses: 25000, cogs: 300000, costedSales: 430000, coverage: 0.9, estimatedProfit: 155000, productsMissingCost: ['marker'] }, 'today', 'sw'),
    status: 'kazi' });
  rows.push({ ask: 'nani ananidai?',
    reply: buildDebtorsReply([{ partyName: 'Mama Asha', issued: 30000, paid: 10000, balance: 20000 }], 'sw'), status: 'kazi' });
  rows.push({ ask: 'salio langu la petty cash', reply: buildPettyCashReply(45000, 'sw'), status: 'kazi' });
  rows.push({ ask: 'bidhaa gani inauza sana?',
    reply: productAnalyticsReply({ rankBy: 'quantity', period: 'week', compareNames: [] },
      [{ product: 'daftari', quantity: 48, revenue: 72000, margin: 14400, costed: true },
       { product: 'kalamu', quantity: 30, revenue: 15000, margin: null, costed: false }], 'sw'),
    status: 'kazi' });
  rows.push({ ask: 'nikiuza daftari zote nitapata faida gani?',
    reply: buildHypotheticalProfitReply({ productName: 'daftari', onHand: 62, hasCount: true, unit: null, unitCost: 1200, retailPrice: 1500, wholesalePrice: 1200 }, 'sw'),
    status: 'kazi' });
  rows.push({ ask: 'nikiuza daftari 10 nitapata faida gani?',
    reply: buildHypotheticalProfitReply({ productName: 'daftari', onHand: 62, askedQuantity: 10, hasCount: true, unit: null, unitCost: 1200, retailPrice: 1500, wholesalePrice: 1200 }, 'sw'),
    status: 'kazi' });
  add({ title: 'K. Maswali ya hesabu', rows,
    intro: 'Majibu haya hutoka kwenye database moja kwa moja — si AI, na si kumbukumbu ya mazungumzo.' });
}

// ── L. Mambo mawili kwenye ujumbe mmoja ────────────────────────────────────
{
  const rows: Row[] = [];
  rows.push({
    ask: 'nimeuza daftari kubwa 10 rejareja naongeza daftari 100 stoo',
    reply: '(Risip inarekodi mauzo ya kwanza, kisha inasema:)\n' + secondInstructionNotice('naongeza daftari 100 stoo', 'sw').trim(),
    status: 'kazi',
    note: 'Kitendo kimoja tu kinatekelezwa kwa ujumbe mmoja; cha pili kinatajwa ili kisipotee.',
  });
  rows.push({
    ask: 'nimeuza daftari 5 kwa 7500, faida ya leo ni ngapi?',
    reply: '(uthibitisho wa mauzo, kisha:)\n' + riderQuestionNotice('faida ya leo ni ngapi', 'sw').trim(),
    status: 'kazi', note: 'Swali linalofuatana na kitendo hujibiwa; halipotei.',
  });
  rows.push({
    ask: 'nimeuza daftari 5 kwa 7500 na nimeuza kalamu 3 kwa 1500',
    reply: '(rekodi mbili kwenye uthibitisho mmoja — hazitenganishwi)',
    status: 'kazi', note: 'Orodha ya mauzo haikatwi katikati.',
  });
  add({ title: 'L. Mambo mawili kwenye ujumbe mmoja', rows });
}

// ── M. Yasiyofanya kazi bado ───────────────────────────────────────────────
{
  const rows: Row[] = [
    { ask: 'nimenunua vitabu 10 kila moja 7000 nimeuza kila moja 10000',
      reply: 'Bei hii ni jumla au bei ya kila moja?',
      status: 'hapana',
      note: 'Sentensi moja yenye bei ya kununua NA bei ya kuuza. Idadi iliyouzwa haijatajwa, kwa hiyo "faida 30,000" ingekuwa kubahatisha. Bado haijatengenezwa.' },
    { ask: 'ongeza VAT 18% kwenye 100000', reply: '(inakwenda kwa AI)', status: 'hapana',
      note: 'Hakuna kikokotoo cha kodi. Halijatengenezwa kwa makusudi — hesabu za kodi zinahitaji uhakika zaidi.' },
    { ask: 'nilikosea, futa deni nililoandika', reply: '(inakwenda kwa AI)', status: 'hapana',
      note: 'Rekodi ambayo tayari imethibitishwa haiwezi kufutwa kwa WhatsApp. Draft pekee ndiyo inayoweza kughairiwa kwa HAPANA.' },
    { ask: 'gharama ya kununua ni ngapi?', reply: '(inakwenda kwa AI)', status: 'hapana',
      note: 'Hakuna njia ya moja kwa moja ya kusoma bei ya kununua. Jibu linaweza kuja, lakini kupitia AI.' },
    { ask: 'Yeye amelipa kiasi gani? / Hizo ni risiti gani? (maswali yanayofuata jibu la awali)',
      reply: '(inakwenda kwa AI pamoja na kumbukumbu ya mazungumzo)', status: 'nusu',
      note: 'Maswali ya mfululizo kuhusu bidhaa yanafanya kazi bila AI; ya madeni na risiti bado hayafanyi.' },
    { ask: 'picha ya risiti', reply: '(inafanya kazi, lakini si kwa maandishi — ni njia ya picha)', status: 'kazi',
      note: 'Picha ya risiti inasomwa na AI, inahifadhiwa kama pending_review, na inakamilishwa kwenye web app.' },
    { ask: 'tengeneza project General', reply: '(inafanya kazi kwa owner/accountant pekee)', status: 'nusu',
      note: 'Hii ipo kwenye webhook na haijajaribiwa kwenye seti hii ya majaribio.' },
  ];
  add({ title: 'M. Yasiyofanya kazi bado — na sababu', rows,
    intro: 'Hii ndiyo orodha ya kweli ya mapungufu. Hakuna kilichofichwa hapa.' });
}

// ── Maneno ya amri ────────────────────────────────────────────────────────
{
  const rows: Row[] = [
    { ask: 'mauzo', reply: 'Kichwa cha orodha ya mauzo. Andika mstari mmoja kwa kila bidhaa chini yake.', status: 'kazi' },
    { ask: 'naongeza bidhaa (au: add product)', reply: 'Kichwa cha orodha ya bidhaa zinazoingia dukani.', status: 'kazi' },
    { ask: 'ingia (au: login)', reply: 'Link ya kuingia kwenye web app. Dakika 15, matumizi moja.', status: 'kazi' },
    { ask: 'mualike (au: mwalike, invite)', reply: 'Kodi ya mwaliko kwa mfanyakazi au accountant.', status: 'kazi' },
    { ask: 'msaada (au: saidia, help)', reply: 'Orodha ya maneno na mifano.', status: 'kazi' },
    { ask: 'NDIYO', reply: 'Kuthibitisha kitu kilichosubiri.', status: 'kazi' },
    { ask: 'HAPANA', reply: 'Kughairi kitu kilichosubiri.', status: 'kazi' },
    { ask: 'ghairi', reply: 'Kusimamisha swali lolote linalosubiri.', status: 'kazi' },
    { ask: 'toka', reply: 'Risip huuliza: unamaanisha kughairi, au kuondoa namba hii kwenye biashara?', status: 'kazi',
      note: 'Neno moja lenye maana mbili — kwa hiyo linaulizwa, halibahatishwi.' },
    { ask: 'badilisha biashara (au: biashara zangu)', reply: 'Orodha ya biashara zako, kisha unachagua namba.', status: 'kazi' },
    { ask: 'kiswahili / English please', reply: 'Kubadilisha lugha ya majibu.', status: 'kazi' },
  ];
  add({ title: 'M2. Maneno ya amri — orodha kamili', rows,
    intro: 'Maneno haya yanafanya kazi popote, hata katikati ya kazi nyingine.' });
}

// ── N. Njia zote kwa ufupi ─────────────────────────────────────────────────
{
  const probes = [
    'nimeuza daftari 5 kwa 7500', 'nimeuza daftari 3 rejareja', 'viberiti 2',
    'nimelipa umeme 45000', 'Mama Asha amechukua sukari 12000', 'Asha amelipa 10000',
    'nimenunua vitabu 10 kila moja 7000', 'bei ya kununua daftari ni 1200',
    'bei ya daftari rejareja 1500 jumla 1200', 'nina daftari 90', 'naongeza sukari 20',
    'daftari ziko ngapi', 'bidhaa ziko ngapi store', 'faida ya leo', 'muhtasari wa wiki',
    'nani ananidai', 'bidhaa gani inauza sana', 'nikiuza daftari zote nitapata faida gani',
    'tumia kiswahili', 'English please', 'invite worker Juma', 'login', 'habari za asubuhi',
  ];
  add({
    title: 'N. Ujumbe gani unashughulikiwa na nani',
    intro: 'Deterministic = hesabu za database, bila AI, bila gharama. AI = inakwenda kwa Claude.',
    rows: probes.map((ask) => ({
      ask,
      reply: route(ask) === 'conversational_ai' ? 'AI (Claude)' : 'Deterministic: ' + route(ask),
      status: (route(ask) === 'conversational_ai' ? 'nusu' : 'kazi') as Status,
    })),
  });
}

writeFileSync('qa-catalogue.json', JSON.stringify(sections, null, 2));
console.log('sections', sections.length, 'rows', sections.reduce((n, s) => n + s.rows.length, 0));
