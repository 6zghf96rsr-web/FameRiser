import { categoryLabel } from "@/lib/rankme/discovery";
import { ProfileCountry } from "./profile-country";
export function CreatorPreview({name,username,platform,bio,avatar,country,category}: {name:string;username:string;platform:string;bio?:string;avatar?:string|null;country?:string|null;category:string}) {
  return <section className="creator-preview" aria-label="Náhled veřejného profilu">
    <span className="creator-preview-caption">Takto tě uvidí návštěvníci</span>
    <div className="creator-preview-person">{avatar?<img src={avatar} alt=""/>:<span className="creator-preview-initial">{name.slice(0,1)||'?'}</span>}<div><h3>{name||'Tvoje jméno'} <ProfileCountry country={country}/></h3><p>{platform}{username&&<> · @{username}</>}</p></div></div>
    <p>{bio||'Přidej krátký popis své tvorby, ať návštěvníci vědí, co u tebe najdou.'}</p><small>{categoryLabel(category)}</small>
    <p className="subtle-note">Návštěvníci uvidí také odkaz na tvůj účet na síti {platform}. E-mail se nezveřejňuje.</p>
  </section>;
}
