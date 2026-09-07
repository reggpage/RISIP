// Illustrative data only. Shared by every public demo so totals cannot drift.
export const DEMO_PRODUCTS = [
  { name: 'Nguvu ya sala', quantity: 2, price: 10600, cost: 8000, before: 5, tier: 'retail' },
  { name: 'Printer', quantity: 3, price: 400000, cost: 300000, before: 8, tier: 'standard' },
  { name: 'Biblia', quantity: 4, price: 11000, cost: 8000, before: 20, tier: 'wholesale' },
] as const;

export const DEMO = {
  revenue: DEMO_PRODUCTS.reduce((sum, item) => sum + item.price * item.quantity, 0),
  cost: DEMO_PRODUCTS.reduce((sum, item) => sum + item.cost * item.quantity, 0),
  quantity: DEMO_PRODUCTS.reduce((sum, item) => sum + item.quantity, 0),
  expenses: 15000,
  priorDebt: 70000,
  debtPayment: 20000,
};
/**
 * One butchery day, illustrative like everything else in here. Bought, sold
 * and left have to agree with each other or the example is teaching the wrong
 * arithmetic, so left is derived rather than typed.
 */
export const BUCHA = { bought: 100, soldToday: 37, get remaining() { return this.bought - this.soldToday; } };

export const demoProfit = DEMO.revenue - DEMO.cost;
export const tsh = (value: number) => `TSh ${new Intl.NumberFormat('en-TZ').format(value)}`;
