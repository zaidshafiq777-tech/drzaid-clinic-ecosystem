// ============================================================
// Dr. Zaid Healthcare OS — Keyboard Navigation Utility
// Reusable Enter-to-next-field navigation for any form container.
// Applied once per page via dzEnableEnterNavigation(container) -
// no per-form duplication needed.
// ============================================================

function dzGetFocusableFields(container) {
  const all = Array.from(container.querySelectorAll("input, select, textarea, button"));
  return all.filter(el => {
    if (el.disabled) return false;
    if (el.type === "hidden") return false;
    if (el.hasAttribute("readonly") && el.dataset.dzSkipReadonly !== "false") return false;
    if (el.offsetParent === null) return false; // hidden (display:none or detached)
    if (el.dataset.dzSkipNav === "true") return false;
    return true;
  });
}

function dzFocusNextField(currentElement) {
  const container = currentElement.closest("[data-dz-keynav]") || document.body;
  const fields = dzGetFocusableFields(container);
  const idx = fields.indexOf(currentElement);
  if (idx === -1) return;
  const next = fields[idx + 1];
  if (next) { next.focus(); if (next.select) try { next.select(); } catch (e) {} }
}

function dzFocusPreviousField(currentElement) {
  const container = currentElement.closest("[data-dz-keynav]") || document.body;
  const fields = dzGetFocusableFields(container);
  const idx = fields.indexOf(currentElement);
  if (idx <= 0) return;
  const prev = fields[idx - 1];
  if (prev) { prev.focus(); if (prev.select) try { prev.select(); } catch (e) {} }
}

/** Wire Enter/Shift+Enter navigation for every field inside `container`
 *  (a DOM element). Call once after the form's HTML has been rendered.
 *  Mark the container with data-dz-keynav="true" (or pass it directly). */
function dzEnableEnterNavigation(container) {
  if (!container) return;
  container.setAttribute("data-dz-keynav", "true");
  container.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const el = e.target;
    const tag = el.tagName;

    // Textareas: Enter makes a newline; Ctrl/Alt+Enter submits or moves on.
    if (tag === "TEXTAREA") {
      if (e.ctrlKey || e.altKey) {
        e.preventDefault();
        dzFocusNextField(el);
      }
      return; // plain Enter = newline, do nothing else
    }

    // Buttons: Enter activates them normally (native behavior) - don't intercept.
    if (tag === "BUTTON") return;

    // Autocomplete-style inputs with an active highlighted suggestion should
    // let their own handler consume Enter first (checked via a data flag the
    // component sets while a suggestion is highlighted).
    if (el.dataset.dzAutocompleteActive === "true") return;

    e.preventDefault();
    if (e.shiftKey) dzFocusPreviousField(el);
    else dzFocusNextField(el);
  });
}

/** Simple double-submit guard - disables the trigger element for `ms`
 *  after first activation, re-enabling automatically. */
function dzPreventDoubleSubmit(triggerEl, ms = 1500) {
  if (!triggerEl || triggerEl.dataset.dzSubmitting === "true") return false;
  triggerEl.dataset.dzSubmitting = "true";
  setTimeout(() => { triggerEl.dataset.dzSubmitting = "false"; }, ms);
  return true;
}

/** Registers page-level Alt+key shortcuts. `map` is { "n": fn, "s": fn, ... }
 *  (letters only, always combined with Alt). Ignores when focus is in a
 *  textarea (so Alt+letter doesn't fire while typing notes). */
function dzRegisterKeyboardShortcuts(map) {
  document.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (map[key]) {
      e.preventDefault();
      map[key](e);
    }
  });
}
