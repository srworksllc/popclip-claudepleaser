/**
 * Claudify - PopClip Extension
 *
 * Copyright (c) 2025 Steve Reinhardt, SR Works LLC
 * Licensed under the MIT License
 *
 * https://srworks.co
 */

const axios = require("axios");

// The Claude mark, inlined as an svg: icon. Inline SVG renders locally and
// instantly, and fill="currentColor" lets PopClip recolor it for light/dark
// and for the highlighted state. Keep this in sync with the "icon" field in
// Config.json, which needs the same string literal (JSON has no constants).
const CLAUDE_ICON =
  'svg:<svg fill="currentColor" fill-rule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg>';

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
  summarize: 0.3,
  // Translations run a bit longer than their source (Spanish/French expand
  // ~20-30%), so leave headroom against the truncation path.
  translate: 1.3
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

// --- TRANSLATE

// Curated target languages. Each becomes a STATIC submenu item, gated by its
// own settings toggle (option-lang-<code>), so users show only the languages
// they use. The submenu must be static (built at module load, not a runtime
// function) because PopClip refuses the `dynamic` entitlement alongside
// `network`. Add a language here plus a matching lang-<code> toggle in
// Config.json; the long tail is covered by the free-text "Other" item.
const TRANSLATE_LANGS = [
  { name: "Spanish", code: "es" },
  { name: "French", code: "fr" },
  { name: "German", code: "de" },
  { name: "Portuguese", code: "pt" },
  { name: "Italian", code: "it" },
  { name: "Chinese (Simplified)", code: "zh" },
  { name: "Japanese", code: "ja" },
  { name: "Korean", code: "ko" }
];

// The translate action's system prompt. Normalize-then-translate: a light
// mechanical cleanup of the source (rule 2) with hard guards against rewriting
// or restyling it (rules 3-5), so lazy input becomes clean, natural, still-you
// output in the target language.
function translateSystem(language) {
  return `You translate the user's text into ${language}. This is a translation, not a rewrite.

RULES:
1. Output ONLY the translation. No preamble, no commentary, no quotes, and do not include the original text.
2. First, silently clean up the source: fix obvious typos, spelling, capitalization, and punctuation, and read any shorthand (u, tmrw, thx) as its intended words. This is a light touch to remove accidental errors only.
3. Do NOT rephrase, restructure, formalize, or change the meaning, tone, voice, or level of slang. Keep it as something the user would actually say.
4. Then translate into natural, native-sounding ${language}. Match the source's register: casual stays casual, formal stays formal, using the language's informal and formal "you" forms where it distinguishes them.
5. Render slang and idioms as the natural equivalent a native speaker would use, never word-for-word. If there is no clean equivalent, use the closest real expression.
6. Keep every name, number, date, and link. Leave proper nouns, @handles, URLs, code, and emojis exactly as written.
7. Preserve paragraph breaks, greetings, and sign-offs.`;
}

// Resolve the system prompt for an action. Built-in actions read a template
// from PROMPTS and may get a tone section appended; "translate" builds a
// target-language prompt.
function buildSystem(promptKey, options, params) {
  if (promptKey === "translate") {
    const language = params && params.language;
    if (!language) {
      throw new Error("No target language selected.");
    }
    return translateSystem(language);
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

  return system;
}

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
async function runAction(promptKey, input, options, params) {
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

    const system = buildSystem(promptKey, options, params);

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
    console.log("Claudify Error:", getErrorMessage(error));

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

// Translate's language list, as a nested submenu inside the main dropdown.
// Static, built at load time: a function-valued submenu would need the
// `dynamic` entitlement, which PopClip refuses alongside `network`. Each
// curated language is gated by its own toggle; the trailing "Other" item
// translates into whatever the user typed in the free-text setting, covering
// anything not in the curated list.
const TRANSLATE_SUBMENU = TRANSLATE_LANGS
  .map(lang => ({
    title: lang.name,
    icon: lang.code,
    code: (input, options) => runAction("translate", input, options, { language: lang.name }),
    requirements: ["text", `option-lang-${lang.code}=1`]
  }))
  .concat([
    { separator: true },
    {
      title: "Other",
      icon: "symbol:globe",
      requirements: ["text", "option-lang-other=1"],
      code: (input, options) => {
        const language = (options.translateother || "").trim();
        if (!language) {
          throw new Error("Settings error: enter a language in the \"Other language\" field first.");
        }
        return runAction("translate", input, options, { language: language });
      }
    }
  ]);

// Single bar entry that opens a submenu (PopClip 5992+). Each child keeps its
// own enable-* requirement so users can still hide individual actions from the
// submenu via settings. The parent has no code of its own, so a primary click
// opens the submenu directly rather than running anything.
exports.actions = [
  {
    title: "Claudify",
    icon: CLAUDE_ICON,
    requirements: ["text"],
    submenu: [
      {
        title: "Improve Writing",
        icon: "symbol:sparkles",
        code: improveWriting,
        requirements: ["text", "option-enable-improve-writing=1"]
      },
      {
        title: "Correct Spelling & Grammar",
        icon: "symbol:checkmark.circle",
        code: spellingAndGrammar,
        requirements: ["text", "option-enable-spelling-grammar=1"]
      },
      {
        title: "Make Longer",
        icon: "symbol:plus.circle",
        code: makeLonger,
        requirements: ["text", "option-enable-make-longer=1"]
      },
      {
        title: "Make Shorter",
        icon: "symbol:minus.circle",
        code: makeShorter,
        requirements: ["text", "option-enable-make-shorter=1"]
      },
      {
        title: "Summarize",
        icon: "symbol:list.bullet",
        code: summarize,
        requirements: ["text", "option-enable-summarize=1"]
      },
      { separator: true },
      {
        title: "Translate",
        icon: "symbol:globe",
        requirements: ["text", "option-enable-translate=1"],
        submenu: TRANSLATE_SUBMENU
      }
    ]
  }
];
