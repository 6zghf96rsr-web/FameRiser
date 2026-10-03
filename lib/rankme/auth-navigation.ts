// PKCE and session cookies belong to one origin. Start authentication there,
// rather than moving hosts after the provider has returned its authorization code.
export function canonicalLoginUrl(currentUrl: string, appUrl?: string) {
  const current = new URL(currentUrl);
  if (!appUrl || current.origin === new URL(appUrl).origin) return null;
  const target = new URL('/login', appUrl);
  target.search = current.search;
  return target.href;
}
