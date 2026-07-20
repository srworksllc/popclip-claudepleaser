# AI SuperClip

A PopClip extension that enhances your selected text using AI. Select text, click an action, and get instant results.

**Created by Steve Reinhardt | [SRWorks LLC](https://srworks.co)**

## Features

| Action | What It Does |
|--------|--------------|
| **Improve Writing** | Enhance clarity and flow while preserving your voice |
| **Spelling & Grammar** | Fix errors without changing your style |
| **Make Longer** | Expand with relevant detail and examples |
| **Make Shorter** | Condense to essential points |
| **Summarize** | Extract key points and action items |

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
- Plain text output (no markdown or special formatting)
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

- [PopClip](https://pilotmoon.com/popclip/) for macOS
- An [Anthropic API key](https://console.anthropic.com/settings/keys)

## Quick Start

1. Install the extension
2. Create an API key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
3. Open PopClip settings, paste your key
4. Select text anywhere and click an action

## Configuration

Open PopClip menu bar icon, then click the gear on AI SuperClip.

### API Key

Paste your Anthropic key from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys). It is stored in the macOS Keychain, and requests go directly from your Mac to Anthropic — nothing routes through a server of ours.

> **Upgrading from 1.x?** Versions through 1.2.0 stored API keys in PopClip's preferences file in cleartext rather than the Keychain. Rotate any key you entered in an earlier version, then re-enter the new one.

Selections are capped at 50,000 characters so an accidental Select All can't run up a large bill.

Usage is billed to your own Anthropic account. Typical actions run a few hundred tokens, so ordinary use costs cents per month.

## Usage

1. Select text in any app
2. Click an AI SuperClip action
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
