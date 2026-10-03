type AccountIdentity = {
  user_metadata?: Record<string, unknown> | null;
  identities?: Array<{ identity_data?: Record<string, unknown> | null }> | null;
};

// Display names are presentation only, never proof of ownership or authorization.
// Never fall back to an email address (including a provider's name-as-email).
export function accountDisplayName(user: AccountIdentity): string {
  const metadata = [user.user_metadata, ...(user.identities || []).map(i => i.identity_data)];
  for (const source of metadata) {
    for (const key of ['display_name', 'full_name', 'name']) {
      const value = source?.[key];
      if (typeof value !== 'string') continue;
      const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
      if (name && !name.includes('@')) return [...name].slice(0, 100).join('');
    }
  }
  return 'Uživatel FameRiser';
}
