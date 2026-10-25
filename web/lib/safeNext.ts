/** A same-site path to return to after sign-in. Anything else (other sites, "//host", control characters) becomes "/". */
export function safeNext(raw: string | null | undefined): string {
  // URL parsing drops tab, CR and LF, so "/\t/evil.com" would become "//evil.com": refuse control characters and "\".
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(raw)) return "/";
  try {
    return new URL(raw, "https://same.site").origin === "https://same.site" ? raw : "/";
  } catch {
    return "/";
  }
}
