/**
 * AI SuperClip - PopClip Extension
 *
 * Copyright (c) 2025 Steve Reinhardt, SR Works LLC
 * Licensed under the MIT License
 *
 * https://srworks.co
 */

const axios = require("axios");

// Request timeout in milliseconds (60 seconds for larger models)
const REQUEST_TIMEOUT = 60000;

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

// Hard ceiling on total time spent across all attempts, including backoff.
const TOTAL_DEADLINE_MS = 90000;

// Upper bound on selection size. Low enough that an accidental Select All
// can't run up a surprise bill on the user's own API key.
const MAX_INPUT_CHARS = 50000;

// Output has to fit inside MAX_TOKENS, which is roughly this many characters
// of English. Each action expands or contracts its input by a different
// factor, so a single global cap is wrong in both directions: it lets Make
// Longer truncate on inputs it can never finish, while needlessly restricting
// Summarize. Derive the real limit per action instead.
const OUTPUT_CHAR_BUDGET = 16000;

const OUTPUT_RATIO = {
  improveWriting: 1,
  correctSpellingGrammar: 1,
  makeLonger: 2,
  makeShorter: 0.5,
  summarize: 0.3
};

function maxInputCharsFor(promptKey) {
  const ratio = OUTPUT_RATIO[promptKey] || 1;
  return Math.min(MAX_INPUT_CHARS, Math.floor(OUTPUT_CHAR_BUDGET / ratio));
}

// The selection is wrapped in this tag so the model can tell the user's
// content apart from our instructions. Without a delimiter, a selection that
// happens to contain list markers or imperative sentences reads as more
// instructions.
const INPUT_TAG = "input_text";

// Dropdown key → Claude model ID. Update here when Anthropic ships a new model.
// Last verified: Jul 2026
const MODELS = {
  fast: "claude-haiku-4-5",
  smart: "claude-sonnet-5"
};

const MAX_TOKENS = 4096;

// Tone instructions (injected into writing prompts when not "default")
const TONES = {
  default: "",
  professional: "Use a professional tone, but still sound like a real person. Clear and precise, not stiff or corporate.",
  casual: "Use a casual, relaxed tone. Write like you're talking to a friend.",
  friendly: "Use a warm, friendly tone. Be approachable and natural, not overly enthusiastic or fake.",
  direct: "Use a direct, no-nonsense tone. Cut to the point. Still sound like a person, not a robot."
};

// Actions that support tone injection
const TONE_ACTIONS = ["improveWriting", "makeLonger", "makeShorter"];

// Prompt templates for each action
const PROMPTS = {
  improveWriting: `You rewrite text for clarity, flow, and impact while preserving the author's meaning and voice.

RULES:
1. Output ONLY the rewritten text. No preamble, no commentary. Do not wrap the output in quotes.
2. Plain text only. No markdown, headers, or bullet points.
3. No em dashes, en dashes, or semicolons. Use commas or periods instead. Hyphens only in compound words.
4. Keep roughly the original length. Cutting filler is fine, but do not add or remove substance.
5. Preserve the author's voice. Make it clearer, not different.
6. Preserve paragraph breaks and line structure.
7. Write like a person: contractions, short sentences, no filler such as "essentially", "basically", or "in order to".
8. If the text is already clear and well written, return it unchanged.
9. If the text is code, markup, a URL, a file path, or structured data rather than prose, return it unchanged.

EXAMPLE
Input:
<input_text>
It is essentially the case that our team was not able to complete the deliverable in a timely fashion — this was due to the fact that there were a number of blockers; we are working to resolve them.
</input_text>
Output:
Our team missed the deadline because several blockers got in the way. We're working through them now.`,

  correctSpellingGrammar: `You fix spelling, grammar, punctuation, and capitalization errors in text. You do not rewrite.

RULES:
1. Output ONLY the corrected text. No preamble, no commentary. Do not wrap the output in quotes.
2. Fix errors only. Do not rephrase, reword, restructure, or adjust style.
3. Leave correct punctuation alone, including em dashes, en dashes, and semicolons. These are not errors, and changing them is rewriting.
4. Fix capitalization: the first word of each sentence, proper nouns, and "I". Input may be entirely lowercase.
5. Preserve paragraph breaks, line structure, and formatting.
6. Do not modify code, URLs, file paths, variable names, or technical terms.
7. If the text contains no errors, return it unchanged.

EXAMPLE
Input:
<input_text>
i cant beleive its already friday — the teams sprint ends tommorow; we should of started earlier.
</input_text>
Output:
I can't believe it's already Friday — the team's sprint ends tomorrow; we should have started earlier.`,

  summarize: `You summarize text, extracting the main ideas, key points, and action items.

RULES:
1. Output ONLY the summary. No preamble, no commentary. Do not wrap the output in quotes.
2. Plain text. No bold, italics, or headers. Plain "- " bullets are allowed when the text covers several distinct topics.
3. No em dashes, en dashes, or semicolons. Use commas or periods instead. Hyphens only in compound words.
4. Aim for 20 to 30 percent of the original length.
5. Plain, objective language. No opinions, interpretation, or editorializing.
6. If the input is shorter than about two sentences, return its core point in one sentence.

EXAMPLE
Input:
<input_text>
Team, the Q3 launch is moving from September 12 to October 3. QA found two blocking bugs in checkout and we would rather ship late than ship broken. Priya is writing the customer comms and needs copy review by Friday. Marketing should hold the press release until the new date is confirmed.
</input_text>
Output:
The Q3 launch moves from September 12 to October 3 because QA found two blocking checkout bugs.
- Priya needs copy review on customer comms by Friday.
- Marketing holds the press release until the new date is confirmed.`,

  makeLonger: `You expand text with real detail while keeping the original tone and message.

RULES:
1. Output ONLY the expanded text. No preamble, no commentary. Do not wrap the output in quotes.
2. Plain text only. No markdown, headers, or bullet points.
3. No em dashes, en dashes, or semicolons. Use commas or periods instead. Hyphens only in compound words.
4. Add substance, not fluff: specifics, examples, context. Do not restate existing points in different words, and do not append a concluding paragraph that repeats what was already said.
5. Aim for roughly double the length, but prioritize quality over word count.
6. Preserve paragraph breaks. Add new paragraphs where natural.
7. Write like a person: contractions, short sentences, no filler.

EXAMPLE
Input:
<input_text>
We're switching to the new build system next sprint. It should speed things up.
</input_text>
Output:
We're switching to the new build system next sprint. The current setup rebuilds everything from scratch on every change, which is why a one line edit can still cost you four minutes.

The new system caches intermediate artifacts and rebuilds only what actually changed. On the test branch, incremental builds dropped from about four minutes to under thirty seconds. Clean builds take about as long as they always did, so the win shows up in day to day work rather than in CI.`,

  makeShorter: `You condense text to its essential points while preserving the core message and tone.

RULES:
1. Output ONLY the condensed text. No preamble, no commentary. Do not wrap the output in quotes.
2. Plain text only. No markdown, headers, or bullet points.
3. No em dashes, en dashes, or semicolons. Use commas or periods instead. Hyphens only in compound words.
4. Cut filler, redundancy, and unnecessary qualifiers. Do not add a summary sentence that was not in the original.
5. Aim for roughly half the original length while keeping every essential fact.
6. Preserve paragraph breaks where the original has them.
7. Write like a person: contractions and direct phrasing.

EXAMPLE
Input:
<input_text>
I wanted to reach out and let you know that, at this point in time, we are still in the process of reviewing the proposal that you sent over last week. There are a few outstanding questions that have come up on our end, and we will aim to get back to you with a more complete response by the end of the week.
</input_text>
Output:
We're still reviewing the proposal you sent last week. A few questions came up, and we'll get back to you with a full response by the end of the week.`
};

// Handle response based on modifier keys
function prepareResponse(data) {
  if (popclip.modifiers.shift) {
    popclip.copyText(data);
  } else {
    popclip.pasteText(data);
  }
}

// Sleep utility for retry delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTP status of a failed request, or null if the request never got a response.
function statusOf(error) {
  return (error && error.response && error.response.status) || null;
}

// True only for transport-level failures (DNS, offline, timeout).
// Deliberately narrow: an error we threw ourselves — a bad response shape, a
// too-long selection — has neither marker, so it is NOT mistaken for a network
// blip and retried at full price.
function isNetworkError(error) {
  return Boolean(error && !error.response && (error.isAxiosError || error.code));
}

// Retry only what a retry can actually fix.
function isRetryableError(error) {
  const status = statusOf(error);
  if (status === null) return isNetworkError(error);
  return status === 429 || (status >= 500 && status < 600);
}

// Get user-friendly error message
function getErrorMessage(error) {
  const status = statusOf(error);

  if (status === 429) return "Rate limit exceeded. Please wait a moment and try again.";
  if (status === 401) return "Invalid API key. Please check your settings.";
  if (status === 403) return "Access denied. Please check your API key permissions.";
  if (status === 404) return "Model unavailable. Your API key may not have access to it.";
  if (status !== null && status >= 500) return "Server error. Please try again later.";

  if (isNetworkError(error)) return "Network error. Please check your connection.";

  // Our own errors carry a message written for the user; surface it verbatim.
  return (error && error.message) || "An unexpected error occurred.";
}

// Wrapper with retry logic, bounded by an overall wall-clock deadline so a
// string of slow attempts can never leave the user watching a spinner for
// minutes (MAX_RETRIES x REQUEST_TIMEOUT would otherwise allow ~3 minutes).
async function callWithRetry(apiFunction, payload, options) {
  const deadline = Date.now() + TOTAL_DEADLINE_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await apiFunction(payload, options);
    } catch (error) {
      // Don't retry settings errors
      if (error.message && error.message.toLowerCase().startsWith("settings error")) {
        throw error;
      }

      // Don't retry if not retryable or on last attempt
      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      // Out of time, or not enough left for another attempt to be worthwhile
      const backoff = RETRY_DELAY_MS * Math.pow(2, attempt);
      if (Date.now() + backoff >= deadline) {
        throw error;
      }

      await sleep(backoff);
    }
  }
}

// --- CLAUDE API
async function callClaudeAPI(payload, options) {
  const key = (options.claudeapikey || "").trim();
  if (!key) {
    throw new Error("Settings error: missing Claude API key. Get one at console.anthropic.com/settings/keys");
  }

  const model = MODELS[options.model] || MODELS.smart;

  const { data } = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: model,
      max_tokens: MAX_TOKENS,
      system: payload.system,
      messages: [{ role: "user", content: payload.text }]
    },
    {
      timeout: REQUEST_TIMEOUT,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    }
  );

  // Validate the shape before indexing into it. A refusal or an unexpected
  // payload yields an empty content array, and blind data.content[0].text
  // would throw a TypeError that reads to the user as a network failure.
  const blocks = data && Array.isArray(data.content) ? data.content : null;
  if (!blocks) {
    throw new Error("Unexpected response from Claude. Please try again.");
  }

  const text = blocks
    .filter(block => block && block.type === "text" && typeof block.text === "string")
    .map(block => block.text)
    .join("")
    .trim();

  if (!text) {
    throw new Error("Claude returned an empty response. Try rephrasing or selecting different text.");
  }

  return { text: text, truncated: data.stop_reason === "max_tokens" };
}

// Generic action runner with error handling and retry
async function runAction(promptKey, input, options) {
  try {
    const text = input.text.trim();

    if (!text) {
      throw new Error("Nothing to process. Select some text first.");
    }

    const limit = maxInputCharsFor(promptKey);
    if (text.length > limit) {
      throw new Error(
        `Selection is too long (${text.length.toLocaleString()} characters, limit ` +
        `${limit.toLocaleString()} for this action). Select a smaller passage.`
      );
    }

    let system = PROMPTS[promptKey];

    // Append tone as its own section for writing actions when not default.
    // The example in each prompt is written in a neutral voice, so say plainly
    // that it governs format rather than tone, or the model splits the
    // difference between the example's voice and the requested one.
    const tone = options.tone || "default";
    if (tone !== "default" && TONE_ACTIONS.includes(promptKey)) {
      const toneInstruction = TONES[tone];
      if (toneInstruction) {
        system += "\n\nTONE\n" + toneInstruction +
          "\nApply this tone to your output. The example above shows formatting and structure, not tone.";
      }
    }

    // Instructions live in the system prompt; the user turn carries only the
    // user's own content, delimited.
    const payload = {
      system: system,
      text: `<${INPUT_TAG}>\n${text}\n</${INPUT_TAG}>`
    };

    const result = await callWithRetry(callClaudeAPI, payload, options);

    // A truncated result must never overwrite the selection — pasting would
    // replace good text with a sentence that stops mid-word. Put the partial
    // on the clipboard so the spend isn't wasted, then report why.
    if (result.truncated) {
      popclip.copyText(result.text);
      throw new Error("Response was cut off because it got too long. The partial result was copied to your clipboard. Try a smaller selection.");
    }

    prepareResponse(result.text);
  } catch (error) {
    // Re-throw settings errors to trigger PopClip settings UI
    if (error.message && error.message.toLowerCase().startsWith("settings error")) {
      throw error;
    }

    // Show failure indicator
    popclip.showFailure();

    // Log detailed error for debugging
    console.log("AI SuperClip Error:", getErrorMessage(error));

    throw new Error(getErrorMessage(error));
  }
}

// Action handlers
async function improveWriting(input, options) {
  await runAction("improveWriting", input, options);
}

async function spellingAndGrammar(input, options) {
  await runAction("correctSpellingGrammar", input, options);
}

async function summarize(input, options) {
  await runAction("summarize", input, options);
}

async function makeLonger(input, options) {
  await runAction("makeLonger", input, options);
}

async function makeShorter(input, options) {
  await runAction("makeShorter", input, options);
}

exports.actions = [
  {
    title: "Improve Writing",
    icon: "iconify:heroicons-solid:sparkles",
    code: improveWriting,
    requirements: ["text", "option-enable-improve-writing=1"]
  },
  {
    title: "Correct Spelling & Grammar",
    icon: "iconify:heroicons-solid:check-circle",
    code: spellingAndGrammar,
    requirements: ["text", "option-enable-spelling-grammar=1"]
  },
  {
    title: "Make Longer",
    icon: "iconify:heroicons-solid:plus-circle",
    code: makeLonger,
    requirements: ["text", "option-enable-make-longer=1"]
  },
  {
    title: "Make Shorter",
    icon: "iconify:heroicons-solid:minus-circle",
    code: makeShorter,
    requirements: ["text", "option-enable-make-shorter=1"]
  },
  {
    title: "Summarize",
    icon: "iconify:heroicons-solid:list-bullet",
    code: summarize,
    requirements: ["text", "option-enable-summarize=1"]
  }
];
