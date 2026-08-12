# CLAUDE.md - Claudepleaser Developer Guide

## Repository Info

| Property | Value |
|----------|-------|
| **GitHub** | `srworksllc/popclip-claudepleaser` |
| **Local Path** | `/Users/stephenreinhardt/Sites/popclip-claudepleaser` |
| **Type** | PopClip extension (macOS) |
| **Extension** | `Claudepleaser.popclipext` |

## Overview

Claudepleaser is a PopClip extension for macOS that enhances selected text using Claude. It is Anthropic-only: one API key, one endpoint. The dropdown selects a speed/quality tradeoff (`smart` or `fast`), and the actual model ID is resolved from `MODELS` in `settings.js`.

**Author:** Steve Reinhardt | SR Works LLC | https://srworks.co
**License:** MIT
**PopClip Version:** 5992+ (PopClip 2026.7 or later)

Everything is exposed as a **submenu** under one "Claudepleaser" bar entry (`submenu` property, PopClip 5992+): the five built-in actions plus Translate. The parent has no `code`, so a primary click opens the submenu. Requiring 5992 is deliberate — there is no 4069-compatible fallback.

**Translate** is the last child of that submenu and carries a **nested** submenu of its own (PopClip allows nesting). That nested menu is a **static** array (`TRANSLATE_SUBMENU`) built at module load from `TRANSLATE_LANGS`, one child per curated language, each gated by an `option-lang-<code>` toggle, plus a trailing free-text **Other** item. It was a second top-level bar action (globe icon) through v2.0.x; it was folded in so the extension owns exactly one slot in the PopClip bar.

> **Why static, not dynamic:** a runtime-generated submenu needs the `dynamic` entitlement, and **PopClip rejects `dynamic` together with `network`** ("The 'dynamic' and 'network' entitlements are not allowed together"). Since Translate makes API calls, it must keep `network` and therefore cannot use a dynamic submenu. Adding a language = a row in `TRANSLATE_LANGS` **and** a matching `lang-<code>` toggle in Config.json. The long tail is covered by the single free-text **Other** slot.

## Project Structure

```
popclip-claudepleaser/
├── Claudepleaser.popclipext/     # PopClip extension bundle
│   ├── Config.json              # Extension metadata and options
│   ├── settings.js              # Main extension logic
│   ├── package.json             # NPM package metadata
│   ├── LICENSE                  # MIT License
│   └── README.md                # User documentation (bundle copy)
├── CLAUDE.md                    # This file
└── README.md                    # User documentation
```

## Actions

| Action | Prompt Key | Icon | Description |
|--------|------------|------|-------------|
| Improve Writing | `improveWriting` | `symbol:sparkles` | Enhance clarity and flow, preserve voice |
| Spelling & Grammar | `correctSpellingGrammar` | `symbol:checkmark.circle` | Fix errors only, no rewording |
| Make Longer | `makeLonger` | `symbol:plus.circle` | Expand with detail, roughly double length |
| Make Shorter | `makeShorter` | `symbol:minus.circle` | Condense to essentials, roughly half length |
| Summarize | `summarize` | `symbol:list.bullet` | Extract key points, 20-30% of original |
| Translate | `translate` | `symbol:globe` (parent); per-language code badge (children) | Translate into a chosen language, normalize-then-translate |

> **All icons are SF Symbols (`symbol:…`), text badges, or one inline `svg:` — never `iconify:`.** The parent "Claudepleaser" entry uses the Claude mark as an inline `svg:` (`CLAUDE_ICON` in settings.js, mirrored into Config.json's `icon` field), because SF Symbols has no Claude glyph; everything below it is SF Symbols. SF Symbols are the best-practice choice for a macOS-native extension: native look, zero maintenance, and instant local rendering. Iconify icons are **fetched from the Iconify web API at render time**, which caused multi-second hover lag (icons not highlighting until fetched, though clicks still worked) — do not reintroduce them. If a specific non-SF shape is ever required, embed it as an inline `svg:` icon (local, also instant) rather than `iconify:`.

**Modifier:** Hold Shift to copy instead of paste.

All actions are children of a single `submenu` on one "Claudepleaser" parent action. A `{ separator: true }` divides the five built-ins from Translate. Each child keeps its own `option-enable-*` requirement, so the settings toggles still hide individual actions from the submenu.

**Translate** is the last child, gated by `option-enable-translate=1`, and its `submenu` is the module-level `TRANSLATE_SUBMENU` constant — a *static* array, not a function. It is built as `TRANSLATE_LANGS.map(...)` — each language becomes a child with `icon: lang.code` (a text badge like `es`), `requirements: ["text", "option-lang-<code>=1"]`, and a `code` that calls `runAction("translate", input, options, { language: lang.name })`. A `{ separator: true }` then an **Other** child follows: it reads `options.translateother`, throws `settingsError(...)` if empty, else translates into that free-text language. Reading an option inside a `code` handler is normal and needs no entitlement — only *generating the submenu itself* at runtime would.

## Supported Models

The dropdown stores intent keys (`smart`, `fast`), not model IDs. The actual ID is resolved at call time from `MODELS` in `settings.js`. Model upgrades therefore require editing one constant — no Config.json changes, and no doc churn from snapshot model IDs leaking into the UI.

| Choice | Dropdown Key | Model ID | Last Verified |
|--------|--------------|----------|---------------|
| Smarter | `smart` | `claude-sonnet-5` | Aug 2026 |
| Faster | `fast` | `claude-haiku-4-5` | Aug 2026 |

`smart` is the default. Unknown or missing keys fall back to `MODELS.smart`, so a stale stored preference degrades to a working model rather than an API error.

`MAX_TOKENS` is `16000`, the documented ceiling for a **non-streaming** request; anything higher requires streaming to avoid an HTTP timeout. It was `2048` under Groq's free-tier TPM budget, then `4096` after Groq was dropped.

`4096` turned out to be too tight once `smart` moved to Sonnet 5, for two compounding reasons:

1. **Sonnet 5 thinks by default.** Omitting the `thinking` field runs adaptive thinking, and `max_tokens` caps thinking *plus* response text together — so part of the budget was being spent before the answer started. `THINKS_BY_DEFAULT` now disables it explicitly for models that need it. These actions are direct transformations, not reasoning problems, so there is nothing to gain from thinking and a real budget cost to leaving it on.
2. **Sonnet 5 uses a denser tokenizer** — roughly 30% more tokens for the same text than the previous generation. The old sizing assumed ~3.9 chars/token, an English-prose figure that no longer holds, and holds far worse for CJK translation targets.

> **`thinking` is sent per-model, not globally.** Older models (Haiku 4.5) don't think unless asked, so the field is omitted for them rather than sent as `disabled` — that avoids depending on whether they'd accept the value at all. Adding a model that thinks by default means adding it to `THINKS_BY_DEFAULT`.


## Code Architecture

### settings.js Structure

- Header and imports (`axios`)
- Configuration constants: `REQUEST_TIMEOUT` (60s), `MAX_RETRIES` (2), `RETRY_DELAY_MS` (500), `MODELS` (intent key→model ID map), `THINKS_BY_DEFAULT` (models needing `thinking: disabled`), `MAX_TOKENS` (16000)
- `TONES` map and `TONE_ACTIONS` list — tone instructions injected into writing prompts when not "default"
- `PROMPTS` object — 5 prompt templates (improveWriting, correctSpellingGrammar, summarize, makeLonger, makeShorter)
- Translate helpers: `TRANSLATE_LANGS` (curated `{name, code}` list driving the static submenu), `translateSystem(language)` (builds the normalize-then-translate prompt for a target language)
- `buildSystem(promptKey, options, params)` — resolves the system prompt: `translateSystem(params.language)` for `translate`, else `PROMPTS[key]` (+ tone section).
- Utility functions: `prepareResponse()` (async — paste vs copy on Shift), `statusOf()`, `isNetworkError()`, `isRetryableError()`, `settingsError()` / `isSettingsError()`, `retryAfterMs()`, `getErrorMessage()` (user-facing), `debugDetail()` (Console log)
- `callWithRetry()` — backoff wrapper; honors `Retry-After` when present
- `callClaudeAPI()` — the single API call; resolves its model via `MODELS[options.model]`
- Action handlers: `runAction()` generic dispatcher + the 5 thin action wrappers
- `exports.actions` array — PopClip action declarations

### API Endpoint

`POST https://api.anthropic.com/v1/messages`, pinned to `anthropic-version: 2023-06-01`. Auth is the `x-api-key` header (not `Authorization: Bearer` — that form is for OAuth tokens and will 401 with a key).

### Error Handling

**Retry Logic:**
- Retries on: transport failures (`isNetworkError`), 429, 5xx
- Does NOT retry on: 401, 403, 404, settings errors, or any error the extension raised itself
- Backoff: `Retry-After` when the response carries it, else exponential (500ms, 1s). Anthropic sends `Retry-After` on 429, and retrying a rate limit after 500ms is guaranteed to fail again — it just burns one of only two attempts.
- Bounded by `TOTAL_DEADLINE_MS` (90s) across all attempts — without it, `MAX_RETRIES` × `REQUEST_TIMEOUT` allows a ~3 minute hang. A `Retry-After` longer than the remaining budget aborts rather than waits.

`isNetworkError` requires `isAxiosError` or a `code` **and** no `response`. This matters: a plain `Error` thrown inside `callClaudeAPI` (bad response shape, oversize input) also lacks `.response`, and a looser check would classify it as a network blip — retrying a deterministic failure three times at full price and reporting "check your connection" for a problem that has nothing to do with the network.

**Response validation:**
- `content` must be an array; text blocks are filtered by `type === "text"` and joined (not `content[0].text`, which throws on an empty array)
- `stop_reason === "max_tokens"` → the partial is copied to the clipboard and an error is raised. It is never pasted: pasting replaces the user's selection, so a truncated response would destroy good text.

**Input limits:**
- Empty selections are rejected before any network call.
- Selection size is capped **per action**, derived from `OUTPUT_CHAR_BUDGET` (16,000 chars — the *target* output size, no longer a 1:1 proxy for `MAX_TOKENS`) divided by that action's `OUTPUT_RATIO`, then clamped to `MAX_INPUT_CHARS` (50,000):

| Action | Ratio | Cap |
|--------|-------|-----|
| Improve Writing | 1× | 16,000 |
| Spelling & Grammar | 1× | 16,000 |
| Make Longer | 2× | 8,000 |
| Make Shorter | 0.5× | 32,000 |
| Summarize | 0.3× | 50,000 |
| Translate | 1.3× | ~12,300 |

  A key with no `OUTPUT_RATIO` entry falls back to `1×` → 16,000. `translate` uses `1.3×` because translations run longer than their source.

  A single global cap was wrong in both directions: Make Longer is told to double its input, so anything over ~8,000 chars could not finish inside `MAX_TOKENS` and reliably hit the truncation path, while Summarize was restricted for no reason.

  **`OUTPUT_CHAR_BUDGET` and `MAX_TOKENS` are no longer sized 1:1.** They used to be (16,000 chars ≈ 4,096 tokens at ~3.9 chars/token), which left exactly zero margin by construction — every action targeted precisely the ceiling. That assumption was English-prose-specific and broke on Sonnet 5's denser tokenizer, and broke badly for CJK translation targets. `MAX_TOKENS` is now ~3× what the char budget implies, so the caps bound *cost and sanity* while `MAX_TOKENS` bounds *truncation*, independently. Raising `OUTPUT_CHAR_BUDGET` still means re-checking that headroom; raising `MAX_TOKENS` alone does not.

**Settings Errors:**
- Thrown via the `settingsError(message)` helper, which wraps `popclip.settingsRequiredError()` (PopClip 5992+) and tags the result with `isSettingsError`. `isSettingsError(error)` is the only check — `callWithRetry` uses it to skip retrying, and `runAction` uses it to re-throw untouched so PopClip opens the settings pane.
- Example: `throw settingsError("Missing Claude API key. Get one at console.anthropic.com/settings/keys")`

> This replaced a convention of throwing `new Error("Settings error: …")` and matching `message.toLowerCase().startsWith("settings error")` in two places. The prefix form still works in PopClip, but it routes on prose — any future message that happened to start with those words would have been misrouted into the settings UI.

**User Messages:**
| Condition | Message |
|-----------|---------|
| 429 | "Rate limit exceeded. Please wait a moment and try again." |
| 401 | "Invalid API key. Please check your settings." |
| 403 | "Access denied. Please check your API key permissions." |
| 404 | "Model unavailable. Your API key may not have access to it." |
| 5xx | "Server error. Please try again later." |
| Network | "Network error. Please check your connection." |
| Empty/invalid response | "Claude returned an empty response…" / "Unexpected response from Claude…" |
| Truncated (`max_tokens`) | "Response was cut off… copied to your clipboard…" |
| Oversize selection | "Selection is too long (N characters, limit 50,000)…" |

404 is checked explicitly because a stale or bad ID in `MODELS` is the most likely cause, and the generic 4xx fallthrough would have surfaced axios's raw message.

## Prompt Design

### Request shape

Instructions go in the `system` parameter; the user turn carries only the user's own content, wrapped in `<input_text>` tags.

```
system:   PROMPTS[promptKey]  (+ TONE section when applicable)
messages: [{ role: "user", content: "<input_text>\n{selection}\n</input_text>" }]
```

The delimiter is load-bearing. Concatenating the selection after a bare `TEXT:` label gave the model no way to tell content from instructions, so a selection containing a numbered list or an imperative sentence read as further instructions. Wrapping also contains prompt injection: text saying "ignore the above" stays visibly inside the tags.

The one gap: a selection containing a literal `</input_text>` could still break out. Not sanitized, because rewriting the user's text to defend against it would corrupt legitimate output.

### Prompt structure

Each prompt is a role statement, numbered rules, and one worked example. The examples do heavy lifting for the style constraints — no em dashes, contractions, no AI voice — which models learn better from a demonstration than a description. When editing rules, check the example still demonstrates them.

Shared conventions:
1. Output only the result — no preamble, no wrapping quotes. The triple-stated prohibition in rule 1 of each prompt looks redundant and is deliberate: this tool pastes over the selection, so a stray "Here's the improved version:" doesn't read as clumsy, it destroys the user's text.
2. Plain text; Summarize alone may use `- ` bullets for multi-topic content
3. No em dashes, en dashes, or semicolons — **except in Spelling & Grammar** (see below)
4. Preserve paragraph breaks and line structure
5. Writing actions (Improve, Make Longer, Make Shorter) enforce a natural human voice
6. Improve Writing returns input unchanged if it is already good, or if it is code/markup/structured data rather than prose
7. Every prompt states what to do with a **fragment** — a selection that isn't a complete sentence. Without it, "fix capitalization: the first word of each sentence" silently capitalizes half-sentences, and Make Shorter tries to compress text that has nothing left to cut.

### Make Longer had a fabrication bug — understand it before editing that prompt

Running Make Longer on *"We need to reboot the OVH server that hosts Paseo, not the Jobkore app server"* produced confident inventions: that the instance had "been running for several weeks without a restart" and that the other server was "currently handling active traffic." Neither fact was in the input or anywhere else.

Two causes, both structural:

1. **The worked example demonstrated fabrication.** Its input was two vague sentences about a build system; its output asserted "four minutes," "under thirty seconds," and "on the test branch" — none of which appear in the input. Examples are the strongest signal in a prompt, so it was teaching exactly the failure. The example is now an operational instruction expanded *without* new facts, and it carries an explicit note naming what it declined to invent.
2. **The rules made honest expansion impossible.** Old rule 4 demanded "specifics, examples, context" and banned restating existing points, while the length rule asked for roughly double. Given a factual sentence with no spare information, those three constraints can only be satisfied by inventing. The anti-restatement ban is gone (honest expansion of terse factual text *is* partly restatement), and accuracy now explicitly outranks the length target — falling short is defined as a correct result.

> **Do not restore a length target that outranks accuracy, and do not put invented specifics back in the example.** If Make Longer ever feels too timid, the fix is a better example of *honest* expansion, never a stronger push toward length.

The same guard now exists in Improve Writing (rule 4) and Summarize (rule 5), which share the failure class.

### Two conflicts worth not reintroducing

**"No bullet points" vs "preserve line structure."** Improve Writing, Make Longer, and Make Shorter each carry both. Read literally — which is what current models do — selecting a bulleted list and running Improve Writing licenses flattening it into prose. Rule 2 is scoped to *adding* markup for this reason: "Do not add markdown, headers, or bullet points **that were not already in the text**." Don't shorten it back.

**The example anchors length.** Each prompt carries one worked example, and every example input is one to three sentences — while real selections are multi-paragraph. Examples are the strongest signal in a prompt, so the model matches their length and shape as well as their format. Each generative prompt therefore closes with a line scoping the example to format and structure only. The tone injection makes the same move for voice; both are needed, and they fire under different conditions (the tone line only appears when tone ≠ default).

### Spelling & Grammar is deliberately different

It carries **no** punctuation-style rule, and explicitly instructs that em dashes and semicolons are not errors. The style rule exists to stop Claude writing em dashes in prose *it* generates; Spelling & Grammar doesn't generate prose, it preserves the user's. Applying the rule there made the prompt self-contradictory ("no semicolons" vs "fix only errors" vs "return unchanged if no errors") and produced a grammar checker that silently restyled correct punctuation. Its example deliberately keeps an em dash and a semicolon while fixing surrounding typos.

### Tone injection

For writing actions only, a non-default tone is appended to the system prompt as a `TONE` section, along with a line clarifying that the example governs formatting rather than voice — otherwise the model splits the difference between the example's neutral tone and the requested one. Does not apply to Spelling & Grammar or Summarize.

## Config.json Structure

### Option Identifiers

| Identifier | Type | Purpose |
|------------|------|---------|
| `claudeapikey` | secret | Anthropic API key (Keychain) |
| `model` | multiple | Model choice (`smart`, `fast`) |

> **`claudeapikey` must stay `type: "secret"`.** PopClip's `secret` conceals the field and persists the value to the macOS Keychain; `string` does neither — it stores the key in cleartext in `~/Library/Preferences/com.pilotmoon.popclip.plist` and shows it unmasked in settings. This field was `string` through v1.2.0, so any key entered before v2.0.0 was written to that plist and should be rotated. Note that `secret` fields may not declare a `defaultValue`.
| `tone` | multiple | Tone selection (default, professional, casual, friendly, direct) |
| `enable-improve-writing` | boolean | Toggle Improve Writing action |
| `enable-spelling-grammar` | boolean | Toggle Spelling & Grammar action |
| `enable-make-longer` | boolean | Toggle Make Longer action |
| `enable-make-shorter` | boolean | Toggle Make Shorter action |
| `enable-summarize` | boolean | Toggle Summarize action |
| `enable-translate` | boolean | Toggle the Translate item (and its nested language menu) |
| `lang-es` … `lang-ko` | boolean | Per-language toggles; each gates one static submenu item via `option-lang-<code>=1`. `lang-es` defaults on. |
| `lang-other` | boolean | Shows the free-text **Other** submenu item |
| `translateother` | string | Free-text target language for the Other item. Read in JS as `options.translateother`. |

### Action Requirements Format

```javascript
requirements: ["text", "option-enable-improve-writing=1"]
```

Requires text selection AND the toggle option enabled.

## Common Tasks

### Add a New Action

1. Add prompt to `PROMPTS` object in settings.js
2. Create action handler: `async function newAction(input, options) { await runAction("promptKey", input, options); }`
3. Add to `exports.actions` array with title, icon, code, requirements
4. Add toggle option in Config.json with `identifier`, `label`, `type: boolean`, `defaultValue: true`

### Update a Model

When Anthropic ships a newer model, edit one line in `MODELS` in `settings.js`. No Config.json edits needed — the dropdown stores intent keys, not IDs. `./release.sh` then syncs the Model ID column in CLAUDE.md and both READMEs. The human-facing labels ("Smarter", "Faster") are hand-written and never auto-derived.

### Add a Third Model Choice

1. Add the key to `MODELS` in `settings.js`
2. Add the key + label to the `model` dropdown's `values` and `valueLabels` arrays in `Config.json`
3. Add a row to the Supported Models table above (release.sh will keep its ID current)

No new API function is needed — every Claude model uses the same endpoint and request shape.

### Update a Prompt

Edit the relevant key in `PROMPTS` object. Follow existing structure:
- Task description
- RULES: numbered list
- TEXT TO X: label for input

## Release Process

```bash
./release.sh 1.2.0
```

**Steps:**

| Step | Action |
|------|--------|
| 1 | Version bump (Config.json, package.json) |
| 2 | Sync docs — refreshes the "Model ID" column in CLAUDE.md and both READMEs from `MODELS` in settings.js |
| 3 | Build ZIP (`.popclipextz`) |
| 4 | Git commit + tag (includes Config.json, package.json, CLAUDE.md, README.md x2) |
| 5 | Push to GitHub |
| 6 | Create GitHub release with ZIP attached |
| 7 | Cleanup (remove local ZIP) |

**Doc sync (Step 2):**
- Reads `MODELS` from `settings.js` (single source of truth for model IDs)
- Rewrites the Model ID cell of any table row whose key matches a `MODELS` key, in CLAUDE.md and both READMEs
- Hand-written labels ("Smarter", "Faster") are NOT auto-derived — update them manually if the tradeoff a model represents changes

## Distribution

Claudepleaser is **self-distributed** from this repo's GitHub Releases. It is deliberately **not** submitted to the official PopClip Extensions Directory. Don't re-litigate this without new information:

- The only submission path is a PR into the `contrib` folder of [pilotmoon/PopClip-Extensions](https://github.com/pilotmoon/PopClip-Extensions). Merging into `contrib` is *not* publication — `contrib` is explicitly "unpublished / user-contributed / experimental / niche / archived (not maintained or supported)". Listing on popclip.app requires the maintainer to separately promote it into `source`.
- As of Jul 2026, LLM-wrapper submissions stall indefinitely: PRs #1316, #1322, #1323, #1331 (Gemini, ChatGPT Prompt, AI Translate, LLMTranslate) sat open for 3–6 months with no maintainer reply, while non-AI utilities merged within days.
- The directory's criteria also cut against this extension's design: "clear, single purpose" and "just works with minimal configuration" versus ~25 options, and a naming style ("Uppercase", not "Convert to Uppercase") that "Claudepleaser" doesn't fit.

**Consequence — the unsigned warning is permanent.** Directory extensions are digitally signed; ours isn't. PopClip shows an "Unsigned Extension" dialog on install for any non-directory extension carrying the `network` entitlement, which Claudepleaser requires. This is expected, not a bug. It is explained in the top-level README under *About the "Unsigned Extension" warning* — keep that section accurate, since it's the only thing standing between a new user and a dialog that reads like a malware alert.

## Debugging

Enable debug mode:
```bash
defaults write com.pilotmoon.popclip EnableExtensionDebug -bool YES
```

View logs in Console.app:
- Filter: `Process:PopClip Category:Extension`
- Look for: `Claudepleaser error:` messages

> **Use `print()`, not `console.log()`.** PopClip's JS environment defines a `console` object and `console.log` is callable, but it produces **no output** — it silently swallows everything. `print()` is the documented logging global. The extension logged through `console.log` until this was caught, which meant the debug workflow above never worked at all. What gets logged is now `debugDetail(error)` — the API's own error body where there is one — rather than the sanitized message the user already saw in the bar.

Disable debug mode:
```bash
defaults delete com.pilotmoon.popclip EnableExtensionDebug
```

To load the extension without the unsigned-extension prompt while iterating:
```bash
defaults write com.pilotmoon.popclip LoadUnsignedExtensions -bool YES
```

To run `settings.js` through PopClip's own harness without installing it:
```bash
/Applications/PopClip.app/Contents/MacOS/PopClip run settings.js [functionName]
```
The harness always grants network access, but `popclip` properties return empty data — it catches load-time and syntax errors, not behavior.

## PopClip API Reference

### popclip Global Object

**Input:**
- `popclip.input.text` - Selected text
- `popclip.input.html` - HTML (if captureHtml enabled)
- `popclip.input.markdown` - Markdown (if captureHtml enabled)

**Modifiers:**
- `popclip.modifiers.shift` - Boolean
- `popclip.modifiers.command` - Boolean
- `popclip.modifiers.option` - Boolean
- `popclip.modifiers.control` - Boolean

**Methods:**
- `popclip.pasteText(string)` — Paste text. **Returns a promise — always `await`.**
- `popclip.copyText(string)` — Copy to clipboard. **Returns a promise — always `await`.**
- `popclip.showSuccess()` / `popclip.showFailure()` — Show checkmark / X mark
- `popclip.showSettings()` — Open extension settings
- `popclip.settingsRequiredError(message)` — Build an error that opens the settings pane (5992+)

> **`pasteText`, `copyText`, `performCommand`, and `share` all return promises.** This was undocumented for a long time and the extension called them fire-and-forget. Not awaiting lets an action's handler resolve while the paste is still in flight, so PopClip can tear the invocation down underneath it — and it makes "the result was copied to your clipboard" a claim the code doesn't actually guarantee. Every built-in PopClip extension in the app bundle awaits these.

> **Throwing is how you signal failure.** PopClip renders the failure indicator when an action's handler rejects. Calling `showFailure()` *and* throwing is two signals for one failure.

**Options:** `popclip.options.{identifier}`

### Icon Formats

- SF Symbols: `symbol:sparkles` — local, instant. **This is what the extension uses for every action (best practice).**
- Text: `"AI"` (up to 3 chars) — local, instant (used for language badges)
- Inline SVG: `svg:<svg ...>...</svg>` — local, instant; use `fill="currentColor"` so PopClip recolors it. Used for the Claude mark on the parent entry (`CLAUDE_ICON` in settings.js), which SF Symbols has no equivalent for.
- File: `file:icon.png` / `file:icon.svg` — bundled, local
- Iconify: `iconify:heroicons-solid:sparkles` — **avoid**: fetched from the Iconify web API at render time → hover lag

### Built-in Modules

Roughly 20 libraries ship with PopClip and are available via `require()` — the full set is in `/Applications/PopClip.app/Contents/Resources/js_bundles/`. The ones most relevant here:

- `axios` (v1.12.2) — HTTP client (**the only one this extension uses**)
- `js-yaml` — YAML parser
- `sanitize-html`, `htmlparser2`, `linkedom`, `turndown` — HTML processing
- `valibot` — schema validation
- `oauth-1.0a`, `fast-plist`, `case-anything`, `emoji-regex`, `linkifyjs`, and others

Also global without `require()`: `XMLHttpRequest`, `Blob`, `URL`, `URLSearchParams`, `atob`/`btoa`, `setTimeout`, `structuredClone`, `TextEncoder`, Node's `Buffer`, and `sleep()` (a promise-wrapped `setTimeout` — do not shadow it with a local definition).

### Constraints

- Sandbox: No filesystem access
- Network: HTTPS only, requires `network` entitlement
- Dynamic submenus (functions that generate child actions at open time) require the `dynamic` entitlement, which **cannot** be combined with `network`. This extension needs `network`, so all submenus are static arrays built at load time. As of the 2026.8 betas, `dynamic` + `script` is also rejected.
- Language: ES2018 guaranteed; ES2023 via core-js polyfills

> **The `dynamic` + `network` block is dev-overridable, but that changes nothing for shipping.** The PopClip binary carries a hidden `AllowDynamicNetworkExtensions` default that lifts the restriction locally, so a dynamic submenu *can* be prototyped on your own machine. Users won't have it set, so the shipping design still has to use static submenus. Don't let the existence of the override reopen the decision in §Overview.

## Future Improvements

**Medium Priority:**
- Max tokens option for output length control
- `allow other` on the Tone dropdown for a free-text custom tone (needs `buildSystem` to pass an unknown tone string through instead of `TONES` lookup)
- `offers multiple instances` in Config.json (PopClip 5992+) — would let one install provide, say, a Sonnet/professional instance and a Haiku/casual instance as separate bar entries with independent settings

**Not possible — do not re-add:**
- ~~Temperature option for AI creativity control~~. `temperature`, `top_p`, and `top_k` are **rejected with a 400** on Sonnet 5 and every current-generation model. There is no replacement parameter; variation has to come from the prompt. This sat on the roadmap after it had already become unimplementable.

**Low Priority:**
- Additional modifier keys for different behaviors
- HTML/Markdown capture with `captureHtml`
- Localization support

**Done (v3.0.0):**
- Submenu consolidation (single bar icon → `submenu`)
- Removed the Custom Prompt action, its `customprompt`/`enable-custom` options, and `CUSTOM_BASE`
- Translate action with a static per-language submenu (toggles + free-text Other) and a normalize-then-translate prompt that preserves tone and slang, nested inside the main Claudepleaser dropdown rather than a second bar icon

---

PopClip Documentation: https://www.popclip.app/dev/
