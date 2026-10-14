/** Scroll to a field and focus it (for custom validation messages). */
export function focusField(
  target: string | HTMLElement | null | undefined,
): void {
  if (typeof document === "undefined") return;
  const el =
    typeof target === "string" ? document.getElementById(target) : target;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (typeof (el as HTMLElement).focus === "function") {
    try {
      (el as HTMLElement).focus({ preventScroll: true });
    } catch {
      (el as HTMLElement).focus();
    }
  }
}

/**
 * Run native HTML5 constraint validation.
 * Returns false when invalid (browser tooltip shown + focus moved).
 */
export function reportFormValidity(
  form: HTMLFormElement | null | undefined,
): boolean {
  if (!form) return true;
  if (form.checkValidity()) return true;
  form.reportValidity();
  const invalid = form.querySelector(":invalid") as HTMLElement | null;
  focusField(invalid);
  return false;
}
