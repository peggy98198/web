/* Global registry for prompt builders, one per AI model, built to be easily extended */
"use strict"; /* Enforce strict mode for safer JavaScript */

/* Define a global namespace object to avoid polluting window directly */
window.PromptEngines = window.PromptEngines || {}; /* Initialize the prompt engine container if not present */

/* Utility: very small Korean→English dictionary-based translator with extensibility */
const MiniTranslator = { /* Start a simple translator object */
  /* Translate a sentence by replacing known terms using provided lexicon merged with model lexicon */
  translate: function (koreanText, mergedLexicon) { /* Define translate function that accepts text and lexicon */
    let output = koreanText; /* Initialize output with original text */
    const allKeys = Object.keys(mergedLexicon || {}); /* Get all dictionary keys to replace */
    allKeys.sort((a, b) => b.length - a.length); /* Sort keys by length to replace longer phrases first */
    for (const key of allKeys) { /* Iterate through each dictionary key */
      const value = mergedLexicon[key]; /* Retrieve English translation value */
      if (!value) continue; /* Skip if no value exists */
      const pattern = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"); /* Escape special regex chars in key */
      output = output.replace(pattern, value); /* Replace all occurrences of key with value */
    }
    return output; /* Return translated or partially translated string */
  }
}; /* End translator */

/* Utility: parse user text into structured slots with naive heuristics */
const SlotParser = { /* Start slot parser module */
  /* Extract basic slots by looking for commas and common phrase markers */
  parse: function (text) { /* Define parse function for input text */
    const base = text.trim(); /* Remove leading and trailing spaces */
    const parts = base.split(/[.,\n]/).map(s => s.trim()).filter(Boolean); /* Split by punctuation to segments */
    /* Heuristic mapping of segments to slots */
    return { /* Return object with semantic slots */
      subject: parts[0] || "product beauty shot", /* First segment becomes subject if present */
      environment: parts[1] || "studio setting with clean background", /* Second segment becomes environment */
      lighting: parts.find(p => /조명|빛|광|햇살/.test(p)) || "soft diffuse lighting", /* Find lighting-related segment */
      materials: parts.find(p => /유리|메탈|금속|플라스틱|실크|거울/.test(p)) || "glass, metal, plastic", /* Find material hint */
      mood: parts.find(p => /분위기|무드|차분|고급|상쾌|따뜻/.test(p)) || "elegant and fresh", /* Find mood hint */
      composition: parts.find(p => /구도|상단|하단|3분할|클로즈업|원근/.test(p)) || "centered hero close-up", /* Find composition hint */
      details: parts.slice(2).join(", ") || "crisp label, accurate color, subtle reflections", /* Use remaining segments as details */
      duration: 4 /* Provide a default short duration for video engines */
    }; /* End object */
  }
}; /* End SlotParser */

/* Factory: create a builder from a model record */
function createBuilder(modelRecord) { /* Define factory function to construct a builder */
  const params = modelRecord.params || {}; /* Extract parameter keys for the model */
  const template = modelRecord.template || ""; /* Extract template string for prompt formatting */

  /* Builder function that returns the final prompt and parameter string */
  return function buildPrompt(input, engine, uiOptions) { /* Define buildPrompt function with input text, engine, and UI options */
    const mergedLexicon = Object.assign( /* Merge lexicons in order of priority */
      {}, /* Start with empty object */
      (window.GlobalGuidelines && window.GlobalGuidelines.lexicon) || {}, /* Include any global lexicon if present */
      modelRecord.lexicon || {} /* Include model-specific lexicon */
    ); /* End merge */

    const slots = SlotParser.parse(input); /* Parse the input text into semantic slots */
    const translatedSlots = {}; /* Prepare container for translated slots */

    /* Iterate over each slot and translate using lexicon replacements */
    for (const [k, v] of Object.entries(slots)) { /* Loop through the slot entries */
      translatedSlots[k] = MiniTranslator.translate(String(v), mergedLexicon); /* Translate slot string values */
    } /* End loop */

    /* Compose parameter tokens based on UI selected values using model-specific keys */
    const aspectToken = uiOptions.aspect ? `${params.aspectKey} ${uiOptions.aspect}` : ""; /* Build aspect parameter string if provided */
    const stylizeToken = `${params.stylizeKey} ${uiOptions.stylize ?? 50}`; /* Always supply a stylization parameter with default value */
    const seedToken = uiOptions.seed ? `${params.seedKey} ${uiOptions.seed}` : ""; /* Build seed parameter if provided */
    const negativeToken = uiOptions.negative ? `${params.negativeKey} ${MiniTranslator.translate(uiOptions.negative, mergedLexicon)}` : ""; /* Build negative prompt token */

    /* Map engine human-readable to the specific string used in templates if needed */
    translatedSlots.engine = engine; /* Store engine type for templates that include it */
    const filled = template /* Begin filling the template */
      .replace("{subject}", translatedSlots.subject) /* Insert subject */
      .replace("{environment}", translatedSlots.environment) /* Insert environment */
      .replace("{lighting}", translatedSlots.lighting) /* Insert lighting */
      .replace("{materials}", translatedSlots.materials) /* Insert materials */
      .replace("{mood}", translatedSlots.mood) /* Insert mood */
      .replace("{composition}", translatedSlots.composition) /* Insert composition */
      .replace("{details}", translatedSlots.details) /* Insert detail list */
      .replace("{duration}", String(translatedSlots.duration)) /* Insert default duration if used */
      .replace("{engine}", translatedSlots.engine) /* Insert engine name if needed */
      .replace("{aspect}", aspectToken) /* Insert aspect parameter token */
      .replace("{stylize}", stylizeToken) /* Insert stylize parameter token */
      .replace("{seed}", seedToken) /* Insert seed parameter token */
      .replace("{negative}", negativeToken) /* Insert negative parameter token */
      .trim(); /* Trim extra whitespace */

    /* Extract only the final 'Parameters:' line for quick copy if needed */
    const paramsLine = (filled.match(/Parameters:(.*)$/m) || ["", ""])[1].trim(); /* Capture parameter line by regex */

    /* Return both the full prompt and the parameters-only string */
    return { full: filled, params: paramsLine }; /* Provide result object to caller */
  }; /* End buildPrompt */
} /* End createBuilder */

/* Registry builder: install builders for each model ID when guidelines load */
window.PromptEngines.installFromGuidelines = function (guidelines) { /* Define function to install engines from guidelines JSON */
  window.PromptEngines.builders = {}; /* Reset builders registry to an empty object */
  (guidelines.models || []).forEach(model => { /* Iterate through each model record */
    window.PromptEngines.builders[model.id] = createBuilder(model); /* Create and store a builder function keyed by model ID */
  }); /* End iteration */
}; /* End installFromGuidelines */
