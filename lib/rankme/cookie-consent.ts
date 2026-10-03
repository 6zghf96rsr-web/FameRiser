export const CONSENT_SECONDS = 365 * 24 * 60 * 60;
export function currentConsent(raw: string | null, cookies: string, now = Date.now()): boolean {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || !['analytics', 'necessary'].includes(value.choice) || !Number.isFinite(value.savedAt)) return false;
    if (value.savedAt > now || now - value.savedAt >= CONSENT_SECONDS * 1000) return false;
    const expected = `rankme_analytics=${value.choice === 'analytics' ? 'yes' : 'no'}`;
    return cookies.split(';').some(cookie => cookie.trim() === expected);
  } catch { return false; }
}
