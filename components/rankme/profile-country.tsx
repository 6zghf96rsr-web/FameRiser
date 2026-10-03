import { countries, countryLabel } from "@/lib/rankme/discovery";

/** Receives the public profile country, never billing details or inferred location. */
export function ProfileCountry({ country }: { country?: string | null }) {
  const code = country?.trim().toUpperCase();
  if (!code || !countries.includes(code)) return null;
  const label = countryLabel(code);
  const flag = String.fromCodePoint(...[...code].map(letter => 0x1f1e6 + letter.charCodeAt(0) - 65));
  return <span className="profile-country" title={label}>
    <span aria-hidden="true" className="profile-country-flag">{flag}</span>
    <span aria-hidden="true">{code}</span>
    <span className="sr-only">Země profilu: {label} ({code})</span>
  </span>;
}
