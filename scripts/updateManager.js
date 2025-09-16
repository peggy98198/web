/* Update manager that loads guidelines JSON and supports auto-refresh and remote source override */
"use strict"; /* Use strict mode for reliability */

/* Define a global to store the currently loaded guidelines and version */
window.GlobalGuidelines = { version: "0.0.0", updatedAt: "", lexicon: {} }; /* Initialize with defaults */

/* Persistent configuration keys used with localStorage */
const STORAGE_KEYS = { /* Key names for saving settings */
  SOURCE_URL: "guidelines.sourceUrl", /* Key to remember custom remote JSON URL */
  AUTO_MINUTES: "guidelines.autoMinutes", /* Key to remember auto-update interval in minutes */
  CACHED_JSON: "guidelines.cachedJson" /* Key to remember last fetched JSON string */
}; /* End storage keys */

/* Helper: fetch JSON with graceful fallback */
async function fetchJson(url) { /* Define async function to fetch JSON content from a URL */
  const response = await fetch(url, { cache: "no-store" }); /* Request the resource without storing cache */
  if (!response.ok) throw new Error(`Failed to fetch ${url}`); /* Throw error for non-200 responses */
  return await response.json(); /* Parse and return JSON body */
} /* End fetchJson */

/* Load guidelines from remote or local file, prefer remote if configured */
async function loadGuidelines() { /* Define main loader function */
  const sourceUrl = localStorage.getItem(STORAGE_KEYS.SOURCE_URL); /* Get any saved remote URL */
  let data = null; /* Initialize variable to hold loaded JSON */

  try { /* Try block to attempt remote then local fetching */
    if (sourceUrl) { /* If a remote URL has been configured */
      data = await fetchJson(sourceUrl); /* Fetch guidelines from remote URL */
      data.source = "remote"; /* Mark the source as remote for transparency */
    } else { /* If no remote URL configured */
      data = await fetchJson("../assets/models.json"); /* Load the local bundled JSON file */
      data.source = "local"; /* Mark the source as local */
    }
    /* Save the raw JSON in localStorage for offline resilience */
    localStorage.setItem(STORAGE_KEYS.CACHED_JSON, JSON.stringify(data)); /* Cache the JSON string persistently */
  } catch (err) { /* Catch any errors during fetch */
    const cached = localStorage.getItem(STORAGE_KEYS.CACHED_JSON); /* Attempt to read cached JSON */
    if (cached) { /* If cached JSON exists */
      data = JSON.parse(cached); /* Parse the cached JSON string */
      data.source = "cache"; /* Mark the source as cache fallback */
    } else { /* If no cache exists */
      throw err; /* Re-throw the original error to surface the issue */
    }
  }

  /* Update the global with newly loaded data */
  window.GlobalGuidelines = { /* Assign loaded data to global variable */
    version: data.version || "0.0.0", /* Set version string */
    updatedAt: data.updatedAt || "", /* Set last updated date */
    lexicon: {} /* Provide a merge point for future global lexicon additions */
  }; /* End assignment */

  /* Install prompt engines using the loaded guidelines */
  window.PromptEngines.installFromGuidelines(data); /* Build and register model-specific builders */

  /* Expose models array for use in the main app */
  window.GlobalGuidelines.models = data.models || []; /* Store model list globally */

  /* Return the loaded data to the caller for UI refreshing */
  return data; /* Provide the full guidelines data back to invoker */
} /* End loadGuidelines */

/* Auto-update scheduler to periodically refresh guidelines from the configured source */
function scheduleAutoUpdate(minutes, onUpdate) { /* Define scheduler with minutes and callback */
  const intervalMs = Math.max(5, Number(minutes) || 60) * 60 * 1000; /* Convert minutes to milliseconds with a minimum bound */
  window.clearInterval(window.__guidelinesInterval); /* Clear any existing interval to prevent duplicates */
  window.__guidelinesInterval = window.setInterval(async () => { /* Start a new repeating interval */
    const data = await loadGuidelines(); /* Reload guidelines on each tick */
    onUpdate && onUpdate(data); /* Invoke callback to refresh UI if provided */
  }, intervalMs); /* Use calculated interval length */
} /* End scheduleAutoUpdate */

/* Export functions to the global window for usage in app.js */
window.GuidelineUpdater = { loadGuidelines, scheduleAutoUpdate }; /* Attach loader and scheduler to a global object */
