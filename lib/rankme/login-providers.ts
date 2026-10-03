// Account sign-in identities are distinct from verified leaderboard profiles.
export const loginProviders = ["facebook", "google", "apple", "twitch", "x"] as const;
export type LoginProvider = (typeof loginProviders)[number];
export const loginProviderNames: Record<LoginProvider, string> = {
  facebook: "Facebook",
  google: "Google",
  apple: "Apple",
  twitch: "Twitch",
  x: "X",
};
