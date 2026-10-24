/** A same-site path to return to after sign-in. Anything else (other sites, "//host") becomes "/". */
export function safeNext(raw: string | null | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
}
