# CLAUDE.md - Claudify Developer Guide

## Repository Info

| Property | Value |
|----------|-------|
| **GitHub** | `srworksllc/popclip-claudify` |
| **Local Path** | `/Users/stephenreinhardt/Sites/popclip-claudify` |
| **Type** | PopClip extension (macOS) |
| **Extension** | `Claudify.popclipext` |

## Overview

Claudify is a PopClip extension for macOS that enhances selected text using Claude. It is Anthropic-only: one API key, one endpoint. The dropdown selects a speed/quality tradeoff (`smart` or `fast`), and the actual model ID is resolved from `MODELS` in `settings.js`.

**Author:** Steve Reinhardt | SR Works LLC | https://srworks.co
**License:** MIT
**PopClip Version:** 5992+ (PopClip 2026.7 or later)

Everything is exposed as a **submenu** under one "Claudify" bar entry (`submenu` property, PopClip 5992+): the five built-in actions plus Translate. The parent has no `code`, so a primary click opens the submenu. Requiring 5992 is deliberate — there is no 4069-compatible fallback.

**Translate** is the last child of that submenu and carries a **nested** submenu of its own (PopClip allows nesting). That nested menu is a **static** array (`TRANSLATE_SUBMENU`) built at module load from `TRANSLATE_LANGS`, one child per curated language, each gated by an `option-lang-<code>` toggle, plus a trailing free-text **Other** item. It was a second top-level bar action (globe icon) through v2.0.x; it was folded in so the extension owns exactly one slot in the PopClip bar.

> **Why static, not dynamic:** a runtime-generated submenu needs the `dynamic` entitlement, and **PopClip rejects `dynamic` together with `network`** ("The 'dynamic' and 'network' entitlements are not allowed together"). Since Translate makes API calls, it must keep `network` and therefore cannot use a dynamic submenu. Adding a language = a row in `TRANSLATE_LANGS` **and** a matching `lang-<code>` toggle in Config.json. The long tail is covered by the single free-text **Other** slot.

## Project Structure

```
popclip-claudify/
├── Claudify.popclipext/     # PopClip extension bundle
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

> **All icons are SF Symbols (`symbol:…`) or text badges — never `iconify:`.** SF Symbols are the best-practice choice for a macOS-native extension: native look, zero maintenance, and instant local rendering. Iconify icons are **fetched from the Iconify web API at render time**, which caused multi-second hover lag (icons not highlighting until fetched, though clicks still worked) — do not reintroduce them. If a specific non-SF shape is ever required, embed it as an inline `svg:` icon (local, also instant) rather than `iconify:`.

**Modifier:** Hold Shift to copy instead of paste.

All actions are children of a single `submenu` on one "Claudify" parent action. A `{ separator: true }` divides the five built-ins from Translate. Each child keeps its own `option-enable-*` requirement, so the settings toggles still hide individual actions from the submenu.

**Translate** is the last child, gated by `option-enable-translate=1`, and its `submenu` is the module-level `TRANSLATE_SUBMENU` constant — a *static* array, not a function. It is built as `TRANSLATE_LANGS.map(...)` — each language becomes a child with `icon: lang.code` (a text badge like `es`), `requirements: ["text", "option-lang-<code>=1"]`, and a `code` that calls `runAction("translate", input, options, { language: lang.name })`. A `{ separator: true }` then an **Other** child follows: it reads `options.translateother`, throws a `Settings error:` if empty, else translates into that free-text language. Reading an option inside a `code` handler is normal and needs no entitlement — only *generating the submenu itself* at runtime would.

## Supported Models

The dropdown stores intent keys (`smart`, `fast`), not model IDs. The actual ID is resolved at call time from `MODELS` in `settings.js`. Model upgrades therefore require editing one constant — no Config.json changes, and no doc churn from snapshot model IDs leaking into the UI.

| Choice | Dropdown Key | Model ID | Last Verified |
|--------|--------------|----------|---------------|
| Smarter | `smart` | `claude-sonnet-5` | Jul 2026 |
| Faster | `fast` | `claude-haiku-4-5` | Jul 2026 |

`smart` is the default. Unknown or missing keys fall back to `MODELS.smart`, so a stale stored preference degrades to a working model rather than an API error.

`MAX_TOKENS` is `4096`. It was previously `2048` to stay inside Groq's free-tier 12K TPM budget (Groq counted reserved `max_tokens` whether used or not). With Groq gone, that constraint no longer applies — the higher ceiling gives "Make Longer" room to actually double a paragraph.


## Code Architecture

### settings.js Structure

- Header and imports (`axios`)
- Configuration constants: `REQUEST_TIMEOUT` (60s), `MAX_RETRIES` (2), `RETRY_DELAY_MS` (500), `MODELS` (intent key→model ID map), `MAX_TOKENS` (4096)
- `TONES` map and `TONE_ACTIONS` list — tone instructions injected into writing prompts when not "default"
- `PROMPTS` object — 5 prompt templates (improveWriting, correctSpellingGrammar, summarize, makeLonger, makeShorter)
- Translate helpers: `TRANSLATE_LANGS` (curated `{name, code}` list driving the static submenu), `translateSystem(language)` (builds the normalize-then-translate prompt for a target language)
- `buildSystem(promptKey, options, params)` — resolves the system prompt: `translateSystem(params.language)` for `translate`, else `PROMPTS[key]` (+ tone section).
- Utility functions: `prepareResponse()` (paste vs copy on Shift), `sleep()`, `isRateLimitError()`, `isRetryableError()`, `getErrorMessage()`
- `callWithRetry()` — exponential backoff wrapper
- `callClaudeAPI()` — the single API call; resolves its model via `MODELS[options.model]`
- Action handlers: `runAction()` generic dispatcher + the 5 thin action wrappers
- `exports.actions` array — PopClip action declarations

### API Endpoint

`POST https://api.anthropic.com/v1/messages`, pinned to `anthropic-version: 2023-06-01`. Auth is the `x-api-key` header (not `Authorization: Bearer` — that form is for OAuth tokens and will 401 with a key).

### Error Handling

**Retry Logic:**
- Retries on: transport failures (`isNetworkError`), 429, 5xx
- Does NOT retry on: 401, 403, 404, settings errors, or any error the extension raised itself
- Exponential backoff: 500ms, 1s delay
- Bounded by `TOTAL_DEADLINE_MS` (90s) across all attempts — without it, `MAX_RETRIES` × `REQUEST_TIMEOUT` allows a ~3 minute hang

`isNetworkError` requires `isAxiosError` or a `code` **and** no `response`. This matters: a plain `Error` thrown inside `callClaudeAPI` (bad response shape, oversize input) also lacks `.response`, and a looser check would classify it as a network blip — retrying a deterministic failure three times at full price and reporting "check your connection" for a problem that has nothing to do with the network.

**Response validation:**
- `content` must be an array; text blocks are filtered by `type === "text"` and joined (not `content[0].text`, which throws on an empty array)
- `stop_reason === "max_tokens"` → the partial is copied to the clipboard and an error is raised. It is never pasted: pasting replaces the user's selection, so a truncated response would destroy good text.

**Input limits:**
- Empty selections are rejected before any network call.
- Selection size is capped **per action**, derived from `OUTPUT_CHAR_BUDGET` (16,000 chars ≈ `MAX_TOKENS`) divided by that action's `OUTPUT_RATIO`, then clamped to `MAX_INPUT_CHARS` (50,000):

| Action | Ratio | Cap |
|--------|-------|-----|
| Improve Writing | 1× | 16,000 |
| Spelling & Grammar | 1× | 16,000 |
| Make Longer | 2× | 8,000 |
| Make Shorter | 0.5× | 32,000 |
| Summarize | 0.3× | 50,000 |
| Translate | 1.3× | ~12,300 |

  A key with no `OUTPUT_RATIO` entry falls back to `1×` → 16,000. `translate` uses `1.3×` because translations run longer than their source.

  A single global cap was wrong in both directions: Make Longer is told to double its input, so anything over ~8,000 chars could not finish inside `MAX_TOKENS` and reliably hit the truncation path, while Summarize was restricted for no reason. Changing `MAX_TOKENS` should mean recomputing `OUTPUT_CHAR_BUDGET`.

**Settings Errors:**
- Messages starting with "Settings error:" trigger PopClip settings UI
- Example: `throw new Error("Settings error: missing Claude API key")`

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
1. Output only the result — no preamble, no wrapping quotes
2. Plain text; Summarize alone may use `- ` bullets for multi-topic content
3. No em dashes, en dashes, or semicolons — **except in Spelling & Grammar** (see below)
4. Preserve paragraph breaks and line structure
5. Writing actions (Improve, Make Longer, Make Shorter) enforce a natural human voice
6. Improve Writing returns input unchanged if it is already good, or if it is code/markup/structured data rather than prose

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

## Debugging

Enable debug mode:
```bash
defaults write com.pilotmoon.popclip EnableExtensionDebug -bool YES
```

View logs in Console.app:
- Filter: `Process:PopClip Category:Extension`
- Look for: `Claudify Error:` messages

Disable debug mode:
```bash
defaults delete com.pilotmoon.popclip EnableExtensionDebug
```

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
- `popclip.pasteText(string)` - Paste text
- `popclip.copyText(string)` - Copy to clipboard
- `popclip.showSuccess()` - Show checkmark
- `popclip.showFailure()` - Show X mark
- `popclip.showSettings()` - Open extension settings

**Options:** `popclip.options.{identifier}`

### Icon Formats

- SF Symbols: `symbol:brain` — local, instant. **This is what the extension uses (best practice).**
- Text: `"AI"` (up to 3 chars) — local, instant (used for language badges)
- Inline SVG: `svg:<svg ...>...</svg>` — local, instant; use `fill="currentColor"` so PopClip recolors it. Fallback for shapes SF Symbols don't cover.
- File: `file:icon.png` / `file:icon.svg` — bundled, local
- Iconify: `iconify:heroicons-solid:sparkles` — **avoid**: fetched from the Iconify web API at render time → hover lag

### Built-in Modules

Available via `require()`:
- `axios` (v1.12.2) - HTTP client
- `js-yaml` (v4.1.0) - YAML parser
- `sanitize-html` (v2.17.0) - HTML sanitizer

### Constraints

- Sandbox: No filesystem access
- Network: HTTPS only, requires `network` entitlement
- Dynamic submenus (functions that generate child actions at open time) require the `dynamic` entitlement, which **cannot** be combined with `network`. This extension needs `network`, so all submenus are static arrays built at load time.
- Language: ES2023 supported

## Future Improvements

**Medium Priority:**
- Temperature option for AI creativity control
- Max tokens option for output length control
- `allow other` on the Tone dropdown for a free-text custom tone (needs `buildSystem` to pass an unknown tone string through instead of `TONES` lookup)

**Low Priority:**
- Additional modifier keys for different behaviors
- HTML/Markdown capture with `captureHtml`
- Localization support

**Done (v2.1.0):**
- Submenu consolidation (single bar icon → `submenu`)
- Removed the Custom Prompt action, its `customprompt`/`enable-custom` options, and `CUSTOM_BASE`
- Translate action with a static per-language submenu (toggles + free-text Other) and a normalize-then-translate prompt that preserves tone and slang, nested inside the main Claudify dropdown rather than a second bar icon

---

PopClip Documentation: https://www.popclip.app/dev/
