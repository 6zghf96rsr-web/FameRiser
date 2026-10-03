import { type Profile } from './config';

// Stored category identifiers stay language independent; translate only presentation.
const categoryNames: Record<string, string> = {
  Creators: 'Tvůrci', Influencers: 'Influenceři', Gamers: 'Hráči',
  Streamers: 'Streameři', Music: 'Hudebníci', Models: 'Modeling',
  Business: 'Firmy a podnikání', Developers: 'Vývojáři', Artists: 'Umělci a malíři',
  Fitness: 'Fitness a trenéři', Lifestyle: 'Životní styl', Photography: 'Fotografové',
  Comedy: 'Humor a zábava', Other: 'Ostatní',
};
export const categoryLabel = (value: string) => categoryNames[value] || value;
export const languages = ['cs','sk','en','de','pl','uk','fr','es','it','pt','nl','hu','ro','hr','sr','sl','bg','ru','tr','ar','zh','ja','ko','hi','vi','id','sv','no','da','fi','el','he','th'];
export const countries = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');
const languageNames = new Intl.DisplayNames(['cs'], {type:'language'});
const countryNames = new Intl.DisplayNames(['cs'], {type:'region'});
export const languageLabel = (code: string) => languageNames.of(code) || code;
export const countryLabel = (code: string) => countryNames.of(code) || code;
export const normalizeText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function suggestCategory(text: string): string | null {
  const normalized = normalizeText(text);
  const rules: [string, RegExp][] = [
    ['Photography', /fotograf|photograph|photoshoot|objektiv/],
    ['Fitness', /fitness|tren[eé]r|trainer|workout|posilov|pilates|yoga|joga/],
    ['Artists', /malir|painter|painting|ilustr|illustrat|sochar|sculpt|design/],
    ['Music', /hudb|music|zpev|singer|pian|guitar|kytar|\bdj\b/],
    ['Developers', /vyvoj|develop|program|coding|software/],
    ['Streamers', /stream|twitch/], ['Gamers', /gaming|gamer|gameplay|videoh/],
    ['Comedy', /komik|comed|humor|stand.up/], ['Models', /modeling|modelka|modelingu/],
    ['Influencers', /influencer/], ['Business', /podnik|business|obchod|firma|restaur/],
    ['Lifestyle', /lifestyle|cestov|travel|moda|fashion/],
  ];
  return rules.find(([,pattern]) => pattern.test(normalized))?.[0] || null;
}
export type DiscoveryFilters = { query: string; category: string; language: string; country: string; region: string };
export function filterProfiles(profiles: Profile[], filters: DiscoveryFilters) {
  const q = normalizeText(filters.query);
  return profiles.filter(p =>
    (filters.category === 'all' || p.category === filters.category) &&
    (filters.language === 'all' || p.language === filters.language) &&
    (filters.country === 'all' || p.country === filters.country) &&
    (!filters.region || normalizeText(p.region || '') === normalizeText(filters.region)) &&
    normalizeText(`${p.name} ${p.username} ${p.platform} ${p.category} ${categoryLabel(p.category)} ${p.bio} ${p.social_bio || ''} ${p.region || ''}`).includes(q),
  );
}
export function pageProfiles(profiles: Profile[], full: boolean, requestedPage: number) {
  const size = full ? 100 : 10;
  const pages = Math.max(1, Math.ceil(profiles.length / size));
  const page = full ? Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1)) : 1;
  return { items: profiles.slice((page - 1) * size, page * size), page, pages, size };
}
