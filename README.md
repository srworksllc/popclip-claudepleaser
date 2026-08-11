# Claudify

A PopClip extension that enhances your selected text using Claude. Select text, click an action, and get instant results.

**Created by Steve Reinhardt | [SRWorks LLC](https://srworks.co)**

## Features

| Action | What It Does |
|--------|--------------|
| **Improve Writing** | Enhance clarity and flow while preserving your voice |
| **Spelling & Grammar** | Fix errors without changing your style |
| **Make Longer** | Expand with relevant detail and examples |
| **Make Shorter** | Condense to essential points |
| **Summarize** | Extract key points and action items |
| **Translate** | Translate into any language you add, preserving your tone and slang |

Everything lives under a single **Claudify** (Claude logo) icon in the PopClip bar — click it to open the submenu. **Translate** sits at the bottom of that menu and opens its own language list.

### Tone

Choose a writing tone that applies to Improve Writing, Make Longer, and Make Shorter:

| Tone | Description |
|------|-------------|
| **Default** | No tone adjustment — uses the AI model's natural response |
| **Professional** | Polished and business-appropriate |
| **Casual** | Relaxed and conversational |
| **Friendly** | Warm and approachable |
| **Direct** | Concise and to the point |

Tone does not apply to Spelling & Grammar or Summarize.

### Additional

- Hold **Shift** to copy result instead of pasting
- Plain text output — no markdown or special formatting (Summarize alone may use `- ` bullets)
- Automatic retry on network errors
- Toggle individual actions on/off in settings
- Two models — switch anytime in settings

## Models

Powered by Claude. Pick the tradeoff you want in settings.

| Choice | Dropdown Key | Model ID | Last Verified |
|--------|--------------|----------|---------------|
| Smarter | `smart` | `claude-sonnet-5` | Jul 2026 |
| Faster | `fast` | `claude-haiku-4-5` | Jul 2026 |

**Smarter** (default) is the better writer — use it for rewriting, expanding, and summarizing. **Faster** returns in about half the time and costs roughly a third as much, which suits quick spelling and grammar passes.

## Requirements

- [PopClip](https://pilotmoon.com/popclip/) **2026.7 or later** (build 5992+) for macOS — required for the single-icon submenu and its nested Translate menu
- An [Anthropic API key](https://console.anthropic.com/settings/keys)

## Installation

### Option 1: Download Release

1. Download `Claudify.popclipextz` from [Releases](../../releases)
2. Double-click to install

### Option 2: Clone Repository

```bash
git clone https://github.com/srworksllc/popclip-claudify.git
```

Double-click the `Claudify.popclipext` folder to install.

### About the "Unsigned Extension" warning

PopClip will show an **Unsigned Extension** warning during install. This is expected. PopClip shows it for any extension that isn't distributed through Pilotmoon's own directory and that needs network access — Claudify talks to the Anthropic API, so it needs it. Click **Install** to continue.

The extension is source-only JavaScript; you can read exactly what it sends in [`Claudify.popclipext/settings.js`](Claudify.popclipext/settings.js). Your API key is stored in the macOS Keychain and is only ever sent to `api.anthropic.com`.

## Quick Start

1. Install the extension
2. Create an API key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
3. Open PopClip settings, paste your key
4. Select text anywhere and click an action

## Configuration

Open PopClip menu bar icon, then click the gear on Claudify.

### API Key

Paste your Anthropic key from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys). It is stored in the macOS Keychain, and requests go directly from your Mac to Anthropic — nothing routes through a server of ours.

> **Upgrading from 1.x?** Versions through 1.2.0 stored API keys in PopClip's preferences file in cleartext rather than the Keychain. Rotate any key you entered in an earlier version, then re-enter the new one.

### Translate

**Translate**, at the bottom of the Claudify menu, opens a list of the languages you've enabled. In settings, flip on the ones you want — Spanish (on by default), French, German, Portuguese, Italian, Chinese (Simplified), Japanese, Korean — and each appears in the menu with a short code badge (`es`, `fr`, …). For anything not in the list, turn on **Other** and type the language in the **Other language** field, e.g. "Tagalog", "Mexican Spanish", or "Brazilian Portuguese".

Translation does a light cleanup of your text first — fixing typos and shorthand — then translates while keeping your tone, register, and slang intact. It's a normalize-then-translate pass, not a rewrite, so lazy input comes out as clean, natural, still-you text in the target language.

### Limits and Cost

Selection size is capped per action so an accidental Select All can't run up a large bill, and so a
result never gets cut off mid-sentence: 8,000 characters for Make Longer, roughly 12,300 for Translate,
16,000 for Improve Writing and Spelling & Grammar, 32,000 for Make Shorter, 50,000 for Summarize.

Usage is billed to your own Anthropic account. Typical actions run a few hundred tokens, so ordinary use costs cents per month.

## Usage

1. Select text in any app
2. Click a Claudify action
3. Text is replaced with the result

**Tip:** Hold **Shift** when clicking to copy the result instead of pasting.

## Debugging

Enable debug mode:

```bash
defaults write com.pilotmoon.popclip EnableExtensionDebug -bool YES
```

View logs in **Console.app** with filter: `Process:PopClip Category:Extension`

## License

MIT License - Copyright (c) 2026 Steve Reinhardt, SRWorks LLC
