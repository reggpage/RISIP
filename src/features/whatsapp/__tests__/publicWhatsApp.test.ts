import { describe, expect, it } from 'vitest';
import {
  buildRisipContactCard,
  buildRisipWhatsAppUrl,
  risipWhatsAppNumber,
  risipWhatsAppNumberDisplay,
} from '../publicWhatsApp';

describe('public Risip WhatsApp links', () => {
  it('uses the official contact number in wa.me format', () => {
    expect(risipWhatsAppNumber()).toBe('255750513538');
  });

  it('prefills a Swahili support message without sending it', () => {
    const url = buildRisipWhatsAppUrl('support', 'sw');
    expect(url).toContain('https://wa.me/255750513538?text=');
    expect(decodeURIComponent(url ?? '')).toContain('nataka kuanza kutumia Risip');
    expect(decodeURIComponent(url ?? '')).toContain('Tafadhali nisaidie kuanza');
  });

  it('uses the login command for an English sign in link', () => {
    expect(decodeURIComponent(buildRisipWhatsAppUrl('login', 'en') ?? '')).toContain('text=login');
  });
});

describe('the contact card that stops WhatsApp showing a number', () => {
  it('names the shop, because the phone book is the only label WhatsApp reads', () => {
    const card = buildRisipContactCard('Dickson Shop');
    expect(card).toContain('FN:Dickson Shop');
    expect(card).toContain('ORG:Dickson Shop');
    expect(card).toContain('TEL;TYPE=CELL;WAID:255750513538');
  });

  it('falls back to Risip rather than saving a nameless contact', () => {
    expect(buildRisipContactCard('')).toContain('FN:Risip');
    expect(buildRisipContactCard(null)).toContain('FN:Risip');
    expect(buildRisipContactCard(undefined)).toContain('FN:Risip');
  });

  it('escapes a comma, which would otherwise split the name field', () => {
    // "Dickson, Shop" unescaped makes two vCard fields and the phone saves the
    // first half only.
    expect(buildRisipContactCard('Dickson, Shop')).toContain('FN:Dickson\\, Shop');
  });

  it('is a complete vCard with CRLF lines', () => {
    const card = buildRisipContactCard('Dickson Shop');
    expect(card.startsWith('BEGIN:VCARD\r\n')).toBe(true);
    expect(card.endsWith('END:VCARD')).toBe(true);
    expect(card).toContain('VERSION:3.0');
  });

  it('shows the number the way a person reads it', () => {
    expect(risipWhatsAppNumberDisplay()).toBe('+255750513538');
  });
});
