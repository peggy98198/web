/* Main application logic: wire UI, call builders, display prompts, manage settings */
"use strict"; /* Enforce strict mode for more predictable behavior */

document.addEventListener("DOMContentLoaded", async () => { /* Wait until the DOM is ready */
  /* Cache DOM elements for repeated use */
  const elModel = document.getElementById("select-model"); /* Dropdown for selecting the AI model */
  const elEngine = document.getElementById("select-engine"); /* Dropdown for selecting generation engine */
  const elKo = document.getElementById("textarea-korean"); /* Textarea for Korean input */
  const elNeg = document.getElementById("input-negative"); /* Input for negative prompt terms */
  const elStylize = document.getElementById("range-stylization"); /* Range for stylization strength */
  const elAspect = document.getElementById("input-aspect"); /* Input for aspect ratio string */
  const elSeed = document.getElementById("input-seed"); /* Input for seed value */
  const elGuidelineName = document.getElementById("guideline-model-name"); /* Span to show model name */
  const elGuidelineVersion = document.getElementById("guideline-version"); /* Span to show version */
  const elGuidelineUpdated = document.getElementById("guideline-updated"); /* Span to show updated date */
  const elGuidelinePre = document.getElementById("pre-guideline"); /* Preformatted block to display guideline text */
  const elResult = document.getElementById("textarea-result"); /* Output textarea for final English prompt */
  const elCopyPrompt = document.getElementById("button-copy"); /* Copy prompt button */
  const elCopyParams = document.getElementById("button-copy-params"); /* Copy parameters-only button */
  const elConvert = document.getElementById("button-convert"); /* Convert button to generate prompt */
  const elClear = document.getElementById("button-clear"); /* Clear all inputs button */
  const elOpenSettings = document.getElementById("button-open-settings"); /* Button to open settings dialog */
  const elCheckUpdates = document.getElementById("button-check-updates"); /* Button to trigger an immediate guidelines reload */
  const dlgSettings = document.getElementById("dialog-settings"); /* Settings dialog element */
  const elGuidelinesUrl = document.getElementById("input-guidelines-url"); /* Input to set remote guidelines URL */
  const elAutoInterval = document.getElementById("input-auto-interval"); /* Input to set auto-update interval minutes */
  const elSaveSettings = document.getElementById("button-save-settings"); /* Button to save settings in dialog */

  /* UI helper to render guideline info for the selected model */
  function renderGuideline(modelId) { /* Define function that draws guideline snapshot text */
    const models = window.GlobalGuidelines.models || []; /* Read loaded model list */
    const model = models.find(m => m.id === modelId); /* Find the model record by ID */
    if (!model) { /* If model not found, render defaults */
      elGuidelineName.textContent = "모델: -"; /* Reset model name tag */
      elGuidelineVersion.textContent = "버전: -"; /* Reset version tag */
      elGuidelineUpdated.textContent = "업데이트: -"; /* Reset updated date tag */
      elGuidelinePre.textContent = "모델을 선택하면 공식 가이드 요약이 여기에 표시됩니다."; /* Show placeholder message */
      return; /* Exit early */
    }
    elGuidelineName.textContent = `모델: ${model.name}`; /* Show human-readable model name */
    elGuidelineVersion.textContent = `버전: ${model.latest}`; /* Show latest supported version string */
    elGuidelineUpdated.textContent = `업데이트: ${window.GlobalGuidelines.updatedAt || "-"}`; /* Show last update date from guidelines */
    const guidelineText = `• Engines: ${model.engines.join(", ")}\n• Parameters: ${Object.entries(model.params).map(([k, v]) => `${k}:${v}`).join(", ")}\n• Rules:\n  - ${model.guideline.join("\n  - ")}`; /* Build a readable summary string */
    elGuidelinePre.textContent = guidelineText; /* Display the constructed guideline summary */
  } /* End renderGuideline */

  /* Load guidelines on startup and render default state */
  const data = await window.GuidelineUpdater.loadGuidelines(); /* Fetch guidelines JSON and install builders */
  renderGuideline(elModel.value); /* Render initial guideline for the default-selected model */

  /* Load persisted settings if available */
  elGuidelinesUrl.value = localStorage.getItem("guidelines.sourceUrl") || ""; /* Fill the source URL field from storage */
  elAutoInterval.value = localStorage.getItem("guidelines.autoMinutes") || "60"; /* Fill the interval input from storage */

  /* Wire: change handlers to update guideline view when selection changes */
  elModel.addEventListener("change", () => renderGuideline(elModel.value)); /* Re-render when the model selection changes */

  /* Wire: open settings dialog when the settings button is clicked */
  elOpenSettings.addEventListener("click", () => dlgSettings.showModal()); /* Open the modal dialog */

  /* Wire: save settings and reschedule auto updates on save */
  elSaveSettings.addEventListener("click", async (e) => { /* Attach click handler to save button */
    e.preventDefault(); /* Prevent default dialog form submission */
    const url = elGuidelinesUrl.value.trim(); /* Read URL input value */
    const minutes = Math.max(5, Number(elAutoInterval.value) || 60); /* Normalize minutes to a minimum value */
    if (url) localStorage.setItem("guidelines.sourceUrl", url); else localStorage.removeItem("guidelines.sourceUrl"); /* Persist or clear remote URL setting */
    localStorage.setItem("guidelines.autoMinutes", String(minutes)); /* Persist auto-update interval minutes */
    await window.GuidelineUpdater.loadGuidelines(); /* Reload guidelines using possibly new source */
    renderGuideline(elModel.value); /* Refresh the guideline snapshot after reloading */
    window.GuidelineUpdater.scheduleAutoUpdate(minutes, () => renderGuideline(elModel.value)); /* Reschedule periodic updates */
    dlgSettings.close(); /* Close the settings dialog */
  }); /* End save settings handler */

  /* Wire: manual update check button */
  elCheckUpdates.addEventListener("click", async () => { /* Attach click handler to update button */
    await window.GuidelineUpdater.loadGuidelines(); /* Reload guidelines immediately */
    renderGuideline(elModel.value); /* Refresh UI with possibly new content */
  }); /* End manual update handler */

  /* Start auto-update schedule using stored or default interval */
  window.GuidelineUpdater.scheduleAutoUpdate(Number(elAutoInterval.value) || 60, () => renderGuideline(elModel.value)); /* Begin periodic check */

  /* Wire: Convert button to build final English prompt */
  elConvert.addEventListener("click", () => { /* Attach click handler for conversion */
    const modelId = elModel.value; /* Read selected model ID */
    const engine = elEngine.value; /* Read selected engine */
    const builder = (window.PromptEngines.builders || {})[modelId]; /* Lookup the builder function for the model */
    if (!builder) { /* If builder is missing, show message */
      elResult.value = "No builder available for the selected model."; /* Display error text in output */
      return; /* Exit early */
    }
    const uiOptions = { /* Build a configuration object from UI inputs */
      aspect: (document.getElementById("input-aspect").value || "").trim(), /* Read aspect ratio string */
      stylize: Number(elStylize.value || 50), /* Read stylization strength as number */
      seed: (document.getElementById("input-seed").value || "").trim(), /* Read seed value string */
      negative: (elNeg.value || "").trim() /* Read negative prompt string */
    }; /* End options object */

    /* Compose custom guideline if provided and merge into a pseudo-prefix for better compliance */
    const customGuideline = (document.getElementById("textarea-custom-guideline").value || "").trim(); /* Read custom guideline text */
    const sourceText = elKo.value.trim(); /* Read the main Korean description text */
    const prefixed = customGuideline ? `${customGuideline}\n${sourceText}` : sourceText; /* Prepend custom rules if any */

    /* Build the final prompt using the model's builder */
    const result = builder(prefixed, engine, uiOptions); /* Execute builder to get final prompt strings */

    /* Place the composed prompt into the output area */
    elResult.value = result.full; /* Show the full, formatted English prompt in the output textarea */

    /* Store the latest result parameters for quick copy action */
    elResult.dataset.params = result.params; /* Save parameter-only string into data attribute */
  }); /* End convert click handler */

  /* Wire: Clear button to reset inputs quickly */
  elClear.addEventListener("click", () => { /* Attach click handler for clear action */
    elKo.value = ""; /* Clear Korean input */
    elNeg.value = ""; /* Clear negative prompt input */
    elStylize.value = "50"; /* Reset stylization slider to middle */
    elAspect.value = ""; /* Clear aspect ratio */
    elSeed.value = ""; /* Clear seed */
    document.getElementById("textarea-custom-guideline").value = ""; /* Clear custom guideline area */
    elResult.value = ""; /* Clear the result output */
  }); /* End clear handler */

  /* Wire: Copy full prompt to clipboard */
  elCopyPrompt.addEventListener("click", async () => { /* Attach click handler for copying prompt */
    try { await navigator.clipboard.writeText(elResult.value); } catch {} /* Attempt to copy and ignore errors */
  }); /* End copy prompt handler */

  /* Wire: Copy parameters-only to clipboard */
  elCopyParams.addEventListener("click", async () => { /* Attach click handler for copying parameters */
    try { await navigator.clipboard.writeText(elResult.dataset.params || ""); } catch {} /* Attempt to copy parameters line */
  }); /* End copy parameters handler */
}); /* End DOMContentLoaded listener */
