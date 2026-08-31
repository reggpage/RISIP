// The sign-up conversation for a number Risip has never seen.
//
// Pure: it takes the step we are on and what the person just said, and returns
// the next step, what to say back, and whether an action should run. No database,
// no network, so it can be unit-tested exhaustively — and so that reading it tells
// you the whole flow.
//
// The one rule that matters here: an unknown number never reaches a paid AI. The
// webhook stores the message and hands it to this state machine instead, so a
// stranger cannot make us spend money on extraction.

import {
  classifyBusinessDescription,
  type BusinessCategory,
  type BusinessSubCategory,
} from './whatsappBusinessClassifier.ts';

export type Lang = 'en' | 'sw';

export type OnboardingStep =
  | 'lang'          // which language?
  | 'menu'          // new business, join one, or already have an account?
  | 'create_name'   // what is the business called?
  | 'create_description' // what does the business sell or do?
  | 'create_category_confirm' // confirm the bounded classification
  | 'create_person' // and what is your name?
  | 'join_code'     // what is the invite code?
  | 'join_person';  // and what is your name?

export type OnboardingAction =
  | { kind: 'none' }
  | { kind: 'set_language'; lang: Lang }
  | {
      kind: 'create_business';
      businessName: string;
      fullName: string;
      category: BusinessCategory | null;
      subCategory: BusinessSubCategory | null;
      confidence: number | null;
      detectedKeywords: string[];
      /** What the shopkeeper typed about the shop, in their own words. */
      description: string;
    }
  | { kind: 'join_business'; code: string; fullName: string }
  | { kind: 'explain_linking' };   // they already have an account: link from the web

export type OnboardingResult = {
  step: OnboardingStep;
  reply: string;
  action: OnboardingAction;
  /** Draft carried between turns. */
  draft: Record<string, string>;
};

const T = {
  lang: {
    en: 'Mambo vip Mdau! Karibu Risip 👋\n\nChagua lugha / Choose a language:\n1. Kiswahili\n2. English',
    sw: 'Mambo vip Mdau! Karibu Risip 👋\n\nChagua lugha / Choose a language:\n1. Kiswahili\n2. English',
  },
  menu: {
    sw: 'Vizuri. Chagua:\n1. Fungua biashara mpya\n2. Jiunge na biashara niliyoalikwa\n3. Nina akaunti tayari',
    en: 'Good. Choose:\n1. Start a new business\n2. Join a business I was invited to\n3. I already have an account',
  },
  askBusiness: {
    sw: 'Biashara yako inaitwaje?',
    en: 'What is your business called?',
  },
  askPerson: {
    sw: 'Wewe unaitwa nani?',
    en: 'What is your name?',
  },
  askDescription: {
    sw: 'Biashara yako inauza nini au inatoa huduma gani? Mfano: “nauza daftari, kalamu na kutoa photocopy”.',
    en: 'What does your business sell or what service does it provide? For example: “I sell books and stationery and offer photocopying”.',
  },
  /**
   * Asked after a NO, and deliberately not the same question again.
   *
   * "I sell food" was refused as Bakery, and repeating the identical prompt got
   * "I sell different types of food" — no more useful, because the question had
   * not told them what would help. Naming the actual goods is what helps.
   */
  askDescriptionAgain: {
    sw: 'Sawa, sio hiyo. Nitajie bidhaa hasa unazouza, mbili au tatu — mfano “chipsi na soda”, “keki na maandazi”, au “sukari, unga na sabuni”.',
    en: 'Fine, not that one. Name the actual goods you sell, two or three — for example “chips and soda”, “cakes and buns”, or “sugar, flour and soap”.',
  },
  unclearDescription: {
    sw: 'Sijaweza kutambua aina ya biashara kwa uhakika. Nitajie bidhaa au huduma kuu mbili au tatu, mfano “chips na kuku”, “nguo na viatu”, au “daftari na photocopy”.',
    en: 'I could not classify the business confidently. Tell me two or three main products or services, for example “chips and chicken”, “clothes and shoes”, or “books and photocopying”.',
  },
  /**
   * What replaced "is that right?".
   *
   * The owner's instruction, and it is the right one: "mwache mtu tu ajielezee,
   * akituma mjibu sawa nimekuelewa". The label was ours, not theirs — a shop
   * that sells wholesale was being asked to agree it was "Duka la Mang'aa /
   * Rejareja", and saying no to a question nobody needed answered is not
   * onboarding, it is an argument. What they typed is the description. The
   * classifier still runs, silently, for the examples and for what the AI is
   * told about the shop.
   */
  descriptionUnderstood: {
    sw: 'Sawa, nimekuelewa.',
    en: 'Got it, thank you.',
  },
  confirmCategoryAgain: {
    sw: 'Jibu *1* Ndiyo, au *2* unieleze tena biashara yako.',
    en: 'Reply YES if that is right, or NO to describe your business again.',
  },
  askCode: {
    sw: 'Andika kodi ya mwaliko (herufi 8).',
    en: 'Send the invite code (8 characters).',
  },
  // "Nina akaunti tayari".
  //
  // The old version told somebody to open a screen they may never have seen,
  // and stopped there — no format, no example, and the menu still waiting
  // underneath, so anything they said next came back as "sijakuelewa".
  //
  // Now it says exactly where, exactly what to send, and accepts the code on
  // its own: somebody who has just copied a code pastes the code, not the word
  // LINK in front of it.
  alreadyHave: {
    sw: 'Sawa. Fungua Risip kwenye simu au kompyuta:\n\n'
      + '*Settings* → *WhatsApp* → *Unganisha namba*\n\n'
      + 'Kisha nitumie kodi utakayoona hapo. Iandike hivi:\n'
      + '_LINK a1b2c3…_\n\n'
      + 'Au bandika kodi yenyewe tu — nitaielewa.',
    en: 'Right. Open Risip on your phone or computer:\n\n'
      + '*Settings* → *WhatsApp* → *Link number*\n\n'
      + 'Then send me the code it shows. Write it like this:\n'
      + '_LINK a1b2c3…_\n\n'
      + 'Or just paste the code on its own — I will understand it.',
  },
  notUnderstood: {
    sw: 'Samahani, sijakuelewa vizuri. Jibu 1, 2 au 3 — au niambie kwa maneno, mfano “nataka kufungua duka langu”.',
    en: 'Sorry, I did not quite follow. Reply 1, 2 or 3 — or just tell me, for example “I want to start my shop”.',
  },
  tooShort: {
    sw: 'Naomba jina kamili la biashara, mfano “Duka la Asha”.',
    en: 'Please send the full business name, for example “Asha’s Shop”.',
  },
  tooShortName: {
    sw: 'Naomba jina lako, mfano “Asha Mkwawa”.',
    en: 'Please send your name, for example “Asha Mkwawa”.',
  },
  badCode: {
    sw: 'Kodi ya mwaliko ina herufi na namba 8, mfano AB12CD34. Angalia tena, au mwombe owner akutumie mpya.',
    en: 'An invite code is 8 letters and numbers, for example AB12CD34. Please check it, or ask the owner to send a fresh one.',
  },
} as const;

export function t(key: keyof typeof T, lang: Lang): string {
  return T[key][lang];
}

/** The opening message for a number we have never seen. */
export function startOnboarding(): OnboardingResult {
  return { step: 'lang', reply: T.lang.en, action: { kind: 'none' }, draft: {} };
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The exact alphabet create_company_invite_code draws from: no O, I, L, 0 or 1,
 * because a code gets read aloud and typed on a phone keypad. Matching the
 * generator is also what makes a code recognisable in a sentence — most real
 * words contain one of the excluded letters, so "BOOKSHOP" cannot pass for one.
 *
 * Roughly one code in nine is all letters, so this must not require a digit.
 */
const CODE_CHARS = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

/**
 * Pulls an invite code out of however the person sent it: bare, lowercase, or
 * wrapped in a sentence ("kodi yangu ni ab12cd34").
 *
 * `anywhere` is false where a stray match would derail the conversation, and
 * true once we have actually asked for a code and the answer should contain one.
 */
export function findInviteCode(text: string | null | undefined, anywhere = false): string | null {
  const said = clean(text).toUpperCase();
  // Codes get pasted split by a space or a hyphen, so the whole message with
  // its separators removed is tried first and counts as "the message is a code".
  const squashed = said.replace(/[^A-Z0-9]/g, '');
  if (CODE_CHARS.test(squashed)) return squashed;
  if (!anywhere) return null;
  for (const token of said.split(/[^A-Z0-9]+/)) {
    if (CODE_CHARS.test(token)) return token;
  }
  return null;
}

export function advanceOnboarding(
  step: OnboardingStep,
  text: string | null,
  lang: Lang,
  draft: Record<string, string> = {},
): OnboardingResult {
  const said = clean(text);
  const stay = (reply: string): OnboardingResult => ({ step, reply, action: { kind: 'none' }, draft });

  switch (step) {
    case 'lang': {
      const picked: Lang | null = /^1$|kiswahili|swahili/i.test(said) ? 'sw'
        : /^2$|english/i.test(said) ? 'en'
        : null;
      if (!picked) return stay(T.lang.en);
      return {
        step: 'menu',
        reply: T.menu[picked],
        action: { kind: 'set_language', lang: picked },
        draft,
      };
    }

    case 'menu': {
      // Somebody who was sent a code usually just pastes it. Answering "please
      // choose 1, 2 or 3" to a person who has already told us everything we
      // needed is the most robotic thing this flow could do, so take it.
      const pasted = findInviteCode(said);
      if (pasted) {
        return { step: 'join_person', reply: T.askPerson[lang], action: { kind: 'none' }, draft: { ...draft, code: pasted } };
      }
      // Joining is checked first because its words are the specific ones. Both
      // answers contain "biashara", so testing for it early would swallow the
      // other one.
      if (/^2$|jiung|kujiunga|mwaliko|nimealikwa|nilialikwa|invit|\bkodi\b|\bcode\b|\bjoin\b/i.test(said)) {
        return { step: 'join_code', reply: T.askCode[lang], action: { kind: 'none' }, draft };
      }
      if (/^1$|fungua|kufungua|anzisha|kuanzisha|nianze|\bmpya\b|\bduka\b|kampuni|biashara|new business|\bstart\b|\bopen\b|\bcreate\b/i.test(said)) {
        return { step: 'create_name', reply: T.askBusiness[lang], action: { kind: 'none' }, draft };
      }
      if (/^3$|akaunti|account|tayari|nimesajili|nimeshasajili|already|registered/i.test(said)) {
        return { step: 'menu', reply: T.alreadyHave[lang], action: { kind: 'explain_linking' }, draft };
      }
      return stay(T.notUnderstood[lang] + '\n\n' + T.menu[lang]);
    }

    case 'create_name': {
      if (said.length < 2) return stay(T.tooShort[lang]);
      return {
        step: 'create_description',
        reply: T.askDescription[lang],
        action: { kind: 'none' },
        draft: { ...draft, businessName: said.slice(0, 80) },
      };
    }

    case 'create_description': {
      if (said.length < 3) return stay(T.unclearDescription[lang]);
      // No confirmation question. See T.descriptionUnderstood: the category is
      // our word for their shop, and asking them to agree with it earned a "no"
      // from anybody selling wholesale. A classification that fails now costs
      // nothing — the description is kept either way, and the trade only
      // decides which examples the welcome shows.
      const guess = classifyBusinessDescription(`${draft.businessName ?? ''} ${said}`);
      return {
        step: 'create_person',
        reply: `${T.descriptionUnderstood[lang]}\n\n${T.askPerson[lang]}`,
        action: { kind: 'none' },
        draft: {
          ...draft,
          businessDescription: said.slice(0, 300),
          ...(guess ? {
            businessCategory: guess.category,
            businessSubCategory: guess.sub_category,
            classificationConfidence: String(guess.confidence),
            classificationKeywords: JSON.stringify(guess.detected_keywords),
          } : {}),
        },
      };
    }

    // Kept only for conversations already parked here when the question was
    // removed. Any answer moves on; nobody is asked it again.
    case 'create_category_confirm': {
      return { step: 'create_person', reply: T.askPerson[lang], action: { kind: 'none' }, draft };
    }

    case 'create_person': {
      if (said.length < 2) return stay(T.tooShortName[lang]);
      // A trade we could not name is not a reason to send somebody back round
      // the loop. The description they wrote is kept whatever happens, and the
      // classification is only there to choose which examples the welcome
      // shows; without one, the general examples are shown.
      const category = (draft.businessCategory ?? null) as BusinessCategory | null;
      const subCategory = (draft.businessSubCategory ?? null) as BusinessSubCategory | null;
      const rawConfidence = Number(draft.classificationConfidence);
      const confidence = Number.isFinite(rawConfidence) ? rawConfidence : null;
      let detectedKeywords: string[] = [];
      try {
        const parsed = JSON.parse(draft.classificationKeywords ?? '[]');
        if (Array.isArray(parsed)) detectedKeywords = parsed.filter((item): item is string => typeof item === 'string').slice(0, 8);
      } catch {
        detectedKeywords = [];
      }
      return {
        step: 'create_person',
        reply: '',
        action: {
          kind: 'create_business',
          businessName: draft.businessName ?? '',
          fullName: said.slice(0, 80),
          category,
          subCategory,
          confidence,
          detectedKeywords,
          description: draft.businessDescription ?? '',
        },
        draft,
      };
    }

    case 'join_code': {
      const code = findInviteCode(said, true);
      if (!code) return stay(T.badCode[lang]);
      return {
        step: 'join_person',
        reply: T.askPerson[lang],
        action: { kind: 'none' },
        draft: { ...draft, code },
      };
    }

    case 'join_person': {
      if (said.length < 2) return stay(T.tooShortName[lang]);
      return {
        step: 'join_person',
        reply: '',
        action: { kind: 'join_business', code: draft.code ?? '', fullName: said.slice(0, 80) },
        draft,
      };
    }
  }
}

// ── Switching business, for a number that is already linked ────────────────

/** Ask for the membership list or to change the active business. */
export function isSwitchRequest(text: string | null): boolean {
  const said = clean(text).toLowerCase();
  if (/^(?:biashara|business|switch|badilisha)[.!?]*$/i.test(said)) return true;

  const mentionsBusiness = /\b(?:biashara|business|kampuni|company)\b/i.test(said);
  const requestsSwitch = /\b(?:badilisha|kubadilisha|badili|chagua|kuchagua|hamia|kuhamia|switch|change|select|choose)\b/i.test(said);
  const requestsList = /\b(?:orodha|zangu|nilizonazo|list|mine|memberships?)\b/i.test(said);
  const asksActive = /\b(?:ipi|gani|active|current|natumia|using)\b/i.test(said);
  return mentionsBusiness && (requestsSwitch || requestsList || asksActive);
}

/**
 * A direct request for a web sign-in link.
 *
 * Keep this deterministic and ahead of the conversational model: issuing a
 * short-lived session link is control-plane work, not a question the model
 * should improvise an answer to. People naturally wrap the command in a
 * sentence, so accept common Swahili/English phrasing without treating every
 * mention of an unrelated link as a login request.
 */
export function isLoginRequest(text: string | null): boolean {
  const said = clean(text).toLowerCase();
  // "dashboard" is a word on its own now: the welcome teaches it, and the
  // dashboard IS the web app, so it is the same short-lived link.
  if (/^(?:ingia|login|log in|sign in|weblink|dashboard|dashibodi|dashbodi)(?:\s+tafadhali|\s+please)?[.!?]*$/i.test(said)) return true;
  if (/^link[.!?]*$/i.test(said)) return true;

  const mentionsLogin = /\b(?:ingia|kuingia|login|log in|sign in|kulogin|yakulogin)\b/i.test(said);
  const mentionsDashboard = /\b(?:dashboard|dashibodi)\b/i.test(said);
  const mentionsLink = /\b(?:link|kiungo|weblink)\b/i.test(said);
  const requestsAccess = /\b(?:nipe|nipatie|naomba|nataka|nahitaji|nitumie|tuma|fungua|nichek|angalia|nionyeshe|onyesha|kuona|nawezaje|jinsi|send|give|get|open|check|show|see|access|how|can)\b/i.test(said);

  return (mentionsLogin && (mentionsLink || mentionsDashboard || requestsAccess))
    || (mentionsDashboard && (mentionsLink || requestsAccess));
}

/**
 * Reads the answer to a numbered list we just sent. Only ever an index into that
 * list — a company id in a message is never trusted.
 */
export function parseBusinessChoice(text: string | null, count: number): number | null {
  const said = clean(text);
  const m = /^(\d{1,2})$/.exec(said);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= count ? n - 1 : null;
}

export function businessList(
  rows: { company_name: string; role: string; is_active: boolean }[],
  lang: Lang,
): string {
  const head = lang === 'sw' ? 'Biashara zako:' : 'Your businesses:';
  const tail = lang === 'sw' ? 'Jibu namba kubadilisha.' : 'Reply with a number to switch.';
  const lines = rows.map((r, i) => `${i + 1}. ${r.company_name}${r.is_active ? ' ✅' : ''} (${r.role})`);
  return [head, ...lines, '', tail].join('\n');
}
