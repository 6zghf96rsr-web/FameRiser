"use client";
import { categories } from '@/lib/rankme/config';
import { categoryLabel, countries, countryLabel, languages, languageLabel, suggestCategory } from '@/lib/rankme/discovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export type DiscoveryValues = {category: string; language: string; country: string; region: string};
export function ProfileDiscoveryFields({value, onChange, description}: {value: DiscoveryValues; onChange: (next: DiscoveryValues) => void; description: string}) {
  const suggestion = suggestCategory(description);
  return <div className="profile-discovery-fields">
    <label className="wide">Kategorie tvorby<Select value={value.category} onValueChange={category => onChange({...value, category})}><SelectTrigger aria-label="Kategorie tvorby"><SelectValue /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}</SelectContent></Select></label>
    {suggestion && <div className="category-suggestion">Návrh podle popisu: <strong>{categoryLabel(suggestion)}</strong>{suggestion !== value.category && <Button type="button" variant="outline" onClick={() => onChange({...value, category:suggestion})}>Použít návrh</Button>}</div>}
    <label>Hlavní jazyk tvorby<Select value={value.language || 'unset'} onValueChange={language => onChange({...value, language:language === 'unset' ? '' : language})}><SelectTrigger aria-label="Hlavní jazyk tvorby"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">Neuvedeno</SelectItem>{languages.map(c => <SelectItem key={c} value={c}>{languageLabel(c)}</SelectItem>)}</SelectContent></Select></label>
    <div className="wide subtle-note">Země v národním žebříčku se zveřejní až po ověření správcem. O přidání nebo změnu požádej přes <a href="/requests">Ověření země profilu</a>; úprava tohoto formuláře ověřenou zemi nemění.</div>
    <label className="wide">Region / kraj<Input value={value.region} maxLength={80} onChange={e => onChange({...value, region:e.target.value})} placeholder="Např. Praha nebo Jihomoravský kraj" /></label>
    <p className="subtle-note">Kategorii můžeš kdykoli změnit. Uváděj oblast své tvorby, ne soukromou adresu. Tyto údaje budou u ověřeného profilu s placeným nebo promo umístěním veřejné.</p>
  </div>;
}
