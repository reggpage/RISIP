# Chat presentation upgrade, 8 September 2026

The chat now uses the original Illustrator-exported Risip logo. The avatar displays the signed-in user's existing profile image when available, with initials or a neutral profile icon as fallback. No stock portrait is presented as the user's photo.

The visual system uses warm neutral surfaces, charcoal user bubbles, readable Outfit body text, and Lora financial figures. Cards have a separate review heading, product calculations underneath the product name, a distinct total, and explicit confirmation controls. Every number is a string projected from the guarded reply; even an inconsistent quoted calculation is preserved rather than silently recalculated.

The header offers two persistent appearance settings: **Cards** and **Open text**. Open text preserves the original report text instead of converting it to metric tiles. Financial confirmations keep their review table in both modes.

Context buttons are extracted only from choices actually offered in a pending question. Price bands, explicit letter menus, numbered business/product/language menus, offered skip, and yes/no prompts are supported. Unknown quantities and prices remain text input. Destructive account actions do not receive guessed shortcuts. Historical choices are disabled; only the latest pending question can send an answer. Buttons still submit ordinary messages, including `REJAREJA`, `NDIYO`, and `GHAIRI`.

Outgoing messages appear optimistically before acknowledgement, then reconcile to the durable message without duplication. The composer clears on send and preserves any next draft typed during the response. Reply animations follow the scroll only while the user remains at the bottom. The enclosing layout cannot scroll away while focusing the composer; the conversation has its own scroll region.

The loader shows elapsed time and genuine tool-start events from the existing webhook. Answer timing is calculated from the matching persisted inbound turn to its first answer, so it represents server processing time rather than a fabricated estimate. Validated responses then reveal progressively with a cursor and writing status. This is presentation of an already guarded response, **not unverified model-token streaming**. Money tables appear atomically. Reduced-motion preference disables the reveal and decorative animation. The loader clock is isolated from the message list to avoid repainting the conversation every tenth of a second.

The login-link renderer shows a compact domain link rather than an unreadable raw URL. Durable chat-secret redaction now recognizes both `t=` and `token=` login URLs; raw link credentials are not used as display copy in stored history.

## Verification

```text
npx tsc -b
Exit code: 0

npm run build
✓ built in 4.86s
Exit code: 0

npm test
 Test Files  182 passed (182)
      Tests  2635 passed (2635)
Exit code: 0

npm run lint:landing
Exit code: 0

npm run check:edge
21 edge functions checked. No undefined names, no redeclarations, no duplicate imports.
Exit code: 0
```

Full command output is stored alongside this report in `typecheck.txt`, `build.txt`, `tests.txt`, `lint.txt`, and `edge.txt`.

Browser tests used isolated local UI fixtures with delayed SSE responses, not live merchant transactions. They exercised the real ChatPage, renderer, client stream reader, input, and contextual buttons. Existing live database and transport-parity evidence remains in the parent report; this presentation change does not introduce a financial write endpoint or modify financial guards.

Observed in the browser:

- At the initial send, one optimistic bubble and a `0.0` second reading status were visible before the deliberately delayed acknowledgement.
- Price selection sent `REJAREJA`; confirmation sent `NDIYO`; the English Cancel button sent the backend's offered `GHAIRI` reply.
- The real client consumed a tool-phase event and displayed `Looking up prices…` before the answer arrived.
- During reply reveal, the DOM contained the partial text `Nimeele` and, in a second test, `punch`. The final text subsequently completed.
- A next draft typed during processing remained `Ujumbe wangu unaofuata` after the reply completed.
- After acknowledgement, optimistic bubble count was `0`, the old choice was disabled, and the conversation bottom gap was `0` pixels.
- At 390 px, document scroll width was `390`, enclosing app scroll was `0`, and the header remained at its expected `139` px position below the mobile rail. Edit focused the textarea.
- A shortened 390 x 600 visual viewport kept the app height at `600` and composer bottom at `587`, leaving the composer inside the visible area. The layout follows visual-viewport resize events for soft-keyboard accommodation; a physical mobile keyboard was not exercised in this environment.
- Both English and Swahili UI, the persisted appearance toggle, minimap jump, and confirmation layout were inspected. Reduced-motion behavior is implemented through the existing media preference and the reveal effect.
- Console inspection found only the two existing React Router v7 future warnings. No chat runtime errors were observed in the final UI session.

Screenshots: [desktop cards](desktop-cards.png), [desktop open text](desktop-open-text.png), [tool status](desktop-tool-status.png), [mobile choices](mobile-choices.png), [mobile thinking](mobile-thinking.png), [mobile typing](mobile-typing.png), [mobile confirmation](mobile-confirmation.png).
