# Making the assistant smarter, on purpose

Every answer-quality defect fixed in this project so far was found the same way:
the owner noticed it in a real conversation, took a screenshot, and sent it over.
That found real bugs — the comma sale list that recorded TSh 1,500 instead of
9,000, `atlas` vs `atlasi`, "change to english" being refused — but it only ever
catches what somebody happened to be looking at, and it does not survive a second
shop, let alone a hundred.

This is the loop that replaces it. There is no model training here: the
assistant is Claude with tools, and it does not learn from your data. What gets
smarter is **the code around it** — the parsers that recognise a message, the
tools it can call, and the evals that stop a fix from being undone later.

## 1. The log

`whatsapp_audit_log` records what Risip *did* with each message. Since migration
0104 it also records what the message *said*:

| column | meaning |
|---|---|
| `message_text` | the inbound text, with anything phone-shaped masked; `LINK` messages are never stored |
| `claimed_by` | which parser took it. **`conversational_ai` means nothing deterministic matched** |

`claimed_by` is the signal that matters. A message the model had to improvise an
answer for is a message the system does not properly understand yet.

## 2. The queue

```sql
select created_at::date as day, claimed_by, outcome, message_text
from public.whatsapp_learning_gaps
where created_at > now() - interval '7 days'
order by created_at desc;
```

The view holds only what is worth reviewing: anything the model had to answer
itself, plus every clarification, failure and block. Messages a deterministic
parser claimed and applied are working as intended and are not listed.

Ranked by how often the same shape comes back:

```sql
select lower(regexp_replace(message_text, '[0-9]+', 'N', 'g')) as shape,
       count(*) as times, min(created_at) as first_seen, max(created_at) as last_seen
from public.whatsapp_learning_gaps
where created_at > now() - interval '30 days'
group by 1
having count(*) > 1
order by times desc
limit 40;
```

Replacing the digits is what makes the shapes collapse: "nimeuza daftari 5" and
"nimeuza daftari 12" are one gap, not two.

## 3. Deciding what to build

Not every gap is a defect. Sort each one into:

- **Should be deterministic.** A message about money, stock or prices that fell
  through to the model. These are the important ones — the model is good at
  language and bad at arithmetic, and anything touching a number should be
  computed by the database, not improvised. Every such gap becomes a parser or a
  tool.
- **Correctly conversational.** "Habari za asubuhi", "asante", an open question
  about the business. The model is the right answer; leave it alone.
- **A genuine misunderstanding.** The person wanted something Risip cannot do
  yet. That is a feature, not a parser.

## 4. Closing a gap

The order that has worked, every time:

1. **Write the failing test first**, using the exact words from the log. Not a
   paraphrase — the real message, digits and typos included. Half the bugs in
   this project lived in the gap between what somebody typed and what a test
   author imagined they would type.
2. Fix the parser or add the tool.
3. **Verify against production data in a rolled-back transaction** — `begin; …
   rollback;` — before applying anything. A test against a fixture you wrote
   yourself proves only that you are consistent.
4. Deploy, then check the log again in a few days: the shape should stop
   appearing.

Tests live in `src/features/whatsapp/__tests__/`. They import the Deno shared
modules directly, so one suite covers both runtimes.

## 5. What not to do

- **Do not widen a parser until it claims everything.** A parser that grabs a
  message it half-understands is worse than one that passes it to the model: the
  model asks a question, a wrong parser records a number. The comma-list bug lost
  7,500 shillings exactly this way.
- **Do not treat the model as a fallback for arithmetic.** If an answer involves
  money, it comes from a SQL function.
- **Do not store what you would not want to read out.** `message_text` is masked
  and `LINK` messages are dropped. Anything new that gets logged goes through the
  same door.

## Known gaps, as of 15 Aug 2026

- `karatasi a4` and `karatasi a4 rimu` are two catalogue rows for one product;
  the stock-count parser peeled the unit off the name. Needs `merge_products`.
- A selling price can still be set for a product name nobody recognises. The
  confirmation now says so, but nothing stops it.
- "product gani inauza sana" answers by quantity only. By revenue the answer is a
  different product, and the reply should say which measure it used.
