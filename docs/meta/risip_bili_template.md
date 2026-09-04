# Meta WhatsApp template: `risip_bili`

Use one template name with two language translations. This is a transactional
billing reminder, so submit it under **Utility**. The body contains no
promotion, discount or marketing copy.

This document is the exact submission copy and runtime contract. Meta approval
must be completed in WhatsApp Manager before these messages can be delivered
outside the 24-hour customer-service window.

## Swahili (`sw`)

**Body**

```text
Habari, hii ni taarifa ya bili ya Risip ya {{1}}.

Plan: {{2}}
Kiasi cha kulipa: {{3}}
Taarifa: {{4}}

Jibu 1 hapa ili kuomba malipo.
```

## English (`en`)

**Body**

```text
Hello, this is a Risip billing notice for {{1}}.

Plan: {{2}}
Amount due: {{3}}
Notice: {{4}}

Reply 1 here to request payment.
```

## Variables

| Variable | Value from Risip |
| --- | --- |
| `{{1}}` | Business name |
| `{{2}}` | Plan name |
| `{{3}}` | Invoice amount, formatted as `TSh 39,999` |
| `{{4}}` | State-specific notice: due soon, grace period, or suspended |

Examples for `{{4}}`:

- Swahili due soon: `Mwezi mpya unaanza 1 Septemba 2026.`
- Swahili overdue: `Umebakiwa na siku 2 za kuendelea kuandika.`
- Swahili suspended: `Kuandika rekodi mpya kumesimama kwa sasa.`
- English due soon: `New month starts 1 September 2026.`
- English overdue: `You have 2 more day(s) to keep recording.`
- English suspended: `Adding new records is currently paused.`

## Submission settings

- Name: `risip_bili`
- Category: `Utility`
- Languages: `Swahili` and `English`
- Header: none
- Footer: none
- Buttons: none

The sender uses `sw` and `en` in the Cloud API payload. Do not register the
English translation as `en_US` unless the sender is changed at the same time.
