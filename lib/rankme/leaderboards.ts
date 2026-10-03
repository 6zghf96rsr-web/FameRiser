import { categories, platforms, periods } from "./config";
import { countries, languages } from './discovery';

export function networkFromSlug(slug: string) {
  return platforms.find((p) => p.toLowerCase() === slug);
}

export function leaderboardPath(platform = "all") {
  return platforms.some((p) => p === platform)
    ? `/network/${platform.toLowerCase()}`
    : "/";
}

export function boardFilters(query: Record<string, string | string[] | undefined>) {
  return {
    initialPeriod: periods.find(p => p === query.period) || "all",
    initialCategory: categories.find((c) => c === query.category) || "all",
    initialQuery: typeof query.query === "string" ? query.query.slice(0, 200) : "",
    initialFull: query.view === 'full',
    initialPage: typeof query.page === 'string' && /^\d{1,6}$/.test(query.page) ? Math.max(1, Number(query.page)) : 1,
    initialLanguage: typeof query.language === 'string' && languages.includes(query.language) ? query.language : 'all',
    initialCountry: typeof query.country === 'string' && countries.includes(query.country) ? query.country : 'all',
    initialRegion: typeof query.region === 'string' ? query.region.slice(0, 80) : '',
  };
}
