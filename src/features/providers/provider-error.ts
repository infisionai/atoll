/** Connect/validation error → text for the provider card. Strips the stable diagnostic
 * prefix (e.g. "eleven-key-invalid: ") so the card shows only the actionable sentence. */
export function displayProviderError(message: string | null | undefined): string | null {
  if (!message) return null
  const stripped = message.replace(/^[a-z][a-z0-9-]*:\s*/, '').trim()
  return stripped || message.trim() || null
}
