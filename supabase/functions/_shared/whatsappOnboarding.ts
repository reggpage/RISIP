// The sign-up conversation for a number Risip has never seen.
//
// Pure: it takes the step we are on and what the person just said, and returns
// the next step, what to say back, and whether an action should run. No database,
// no network, so it can be unit-tested exhaustively — and so that reading it tells
// you the whole flow.
//
// The one rule that matters here: an unknown number never reaches the AI. The
// webhook stores the message and hands it to this state machine instead, so a
// stranger cannot make us spend money on extraction.

export type Lang = 'en' | 'sw';

export type OnboardingStep =
  | 'lang'          // which language?
  | 'menu'          // new business, join one, or already have an account?
  | 'create_name'   // what is the business called?
  | 'create_person' // and what is your name?
  | 'join_code'     // what is the invite code?
  | 'join_person';  // and what is your name?

export type OnboardingAction =
  | { kind: 'none' }
  | { kind: 'set_language'; lang: Lang }
  | { kind: 'create_business'; businessName: string; fullName: string }
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
    en: 'Karibu Risip 👋\n\nChagua lugha / Choose a language:\n1. Kiswahili\n2. English',
    sw: 'Karibu Risip 👋\n\nChagua lugha / Choose a language:\n1. Kiswahili\n2. English',
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
  askCode: {
    sw: 'Andika kodi ya mwaliko (herufi 8).',
    en: 'Send the invite code (8 characters).',
  },
  alreadyHave: {
    sw: 'Fungua Risip kwenye simu au kompyuta, nenda Settings → WhatsApp, kisha nitumie kodi utakayoona.',
    en: 'Open Risip on your phone or computer, go to Settings → WhatsApp, then send me the code it shows.',
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
        step: 'create_person',
        reply: T.askPerson[lang],
        action: { kind: 'none' },
        draft: { ...draft, businessName: said.slice(0, 80) },
      };
    }

    case 'create_person': {
      if (said.length < 2) return stay(T.tooShortName[lang]);
      return {
        step: 'create_person',
        reply: '',
        action: {
          kind: 'create_business',
          businessName: draft.businessName ?? '',
          fullName: said.slice(0, 80),
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
  if (/^(?:ingia|login|log in|sign in|weblink)(?:\s+tafadhali|\s+please)?[.!?]*$/i.test(said)) return true;
  if (/^link[.!?]*$/i.test(said)) return true;

  const mentionsLogin = /\b(?:ingia|kuingia|login|log in|sign in|kulogin|yakulogin)\b/i.test(said);
  const mentionsDashboard = /\b(?:dashboard|dashibodi)\b/i.test(said);
  const mentionsLink = /\b(?:link|kiungo|weblink)\b/i.test(said);
  const requestsAccess = /\b(?:nipe|nipatie|naomba|nataka|nahitaji|nitumie|tuma|fungua|nichek|angalia|nawezaje|jinsi|send|give|get|open|check|access|how|can)\b/i.test(said);

  return (mentionsLogin && (mentionsLink || mentionsDashboard || requestsAccess))
    || (mentionsDashboard && mentionsLink && requestsAccess);
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
