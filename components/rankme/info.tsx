"use client";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
export const faqs = [
  [
    "Jak souvisí žebříčky sítí s Most Famous?",
    "Instagram, Facebook, TikTok, YouTube, Twitch a X mají vlastní pořadí od prvního místa. Most Famous obsahuje všechny jejich profily a znovu je seřadí podle RankScore z potvrzených plateb bez daně a přidělených kreditů. Ověřený placený profil se automaticky objeví v obou žebříčcích; druhou platbu nepotřebuješ. Částky různých účtů jednoho člověka neslučujeme. Celkově, 24 hodin, 7 dní a 30 dní fungují v každém žebříčku samostatně.",
  ],
  [
    "Co mohu dělat bez placení?",
    "Zdarma se zaregistruješ, propojíš a ověříš své sociální účty, procházíš veřejné placené profily a píšeš komentáře s volitelnými 1–5 hvězdičkami. Tvé nezaplacené sociální účty jsou soukromé; u komentáře je veřejné pouze jméno nebo přezdívka, kterou pro něj zadáš.",
  ],
  [
    "Kdy ostatní uvidí můj účet?",
    "Až po ověření a propojení sociálního účtu, doplnění veřejného profilu a potvrzení platby nebo získání promo místa pro tento konkrétní profil. Promo nabízí stejné funkce i statistiky jako placené umístění. Zobrazí se na místě podle RankScore z potvrzených plateb bez daně a přidělených kreditů. Bez ověření nelze zařadit ani placený, ani promo profil. Kliknutí v žebříčku otevře náhled s možností přejít na původní sociální síť.",
  ],
  [
    "Ovlivňuje hodnocení pořadí?",
    "Ne. Pořadí určuje RankScore z potvrzených plateb bez daně a přidělených kreditů. Přihlášený uživatel může přidat jeden upravitelný komentář k cizímu placenému profilu a volitelně 1–5 hvězdiček. Text a zadané veřejné jméno jsou viditelné po kontrole; hvězdičky bez komentáře nepřijímáme. Komentáře nejsou ověřenými zákaznickými recenzemi.",
  ],
  [
    "Podle čeho se určuje pořadí?",
    "Výhradně podle RankScore z potvrzených plateb bez daně a přidělených kreditů. Vyšší součet znamená vyšší pozici. Při shodě zůstává výše profil, který částky dosáhl dříve. Nejde o hodnocení kvality, popularity ani doporučení profilu.",
  ],
  [
    "Platím při navýšení celou částku znovu?",
    "Ne. Zvolíš novou jednorázovou platbu, která se přičte k předchozím. Konečnou cenu včetně daně potvrdíš před úhradou. RankScore a pořadí se aktualizují až po potvrzení platby.",
  ],
  [
    "Zůstane mi moje pozice navždy?",
    "Celková historicky zaplacená částka v Celkově sama neexpiruje. Umístění ale garantované není: kdokoliv tě může překonat. Skrytí profilu, moderace nebo refundace mohou jeho účast a hodnotu změnit.",
  ],
  [
    "Jak fungují období 24 hodin, 7 dní a 30 dní?",
    "Časové žebříčky sčítají RankScore z potvrzených plateb po odečtení vratek za posledních 24 hodin, 7 dní nebo 30 dní. Jde o průběžná okna, nikoliv kalendářní období. Starší platby zůstávají v celkovém součtu. U profilu uvádíme hodnotu umístění, tedy součet plateb a přidělených kreditů; pro vybrané období jeho skóre. Rozpis plateb a promo kreditu vidí pouze vlastník ve svém účtu.",
  ],
  [
    "Zaručujete nové sledující?",
    "Ne. Kupuješ reklamní umístění v žebříčku. Platba nezaručuje počet zobrazení, kliknutí ani nových sledujících.",
  ],
  [
    "Mohu přidat více sociálních sítí?",
    "Ano. Nejdříve připravujeme Instagram, Facebook, TikTok, YouTube, Twitch a X; další sítě přidáme později. Jeden účet FameRiser může spravovat několik ověřených sociálních profilů. Každý má vlastní hodnotu, pozici, odkaz a statistiky.",
  ],
  [
    "Kdy se platba projeví?",
    "Jakmile server obdrží a ověří potvrzení od Dodo. Samotný návrat z platební stránky nestačí. Stav uvidíš v historii plateb ve svém účtu.",
  ],
  [
    "Jak funguje ochrana proti falešným profilům?",
    "Připojení se dokončí až po ověření přístupu ke konkrétnímu sociálnímu účtu. Pro Instagram připravujeme tento postup: pošli profilu FameRiser zprávu „FameRiser“, obdržíš jednorázový kód na 24 hodin a po přihlášení jej vložíš do aplikace. Kód bude vázaný na účet skutečného odesílatele. Odesílání zatím není aktivní. Na některých sítích bude potřeba zahájit konverzaci nebo použít jiný způsob ověření. Ověření potvrzuje přístup k účtu, nikoli občanskou identitu nebo práva ke všemu jeho obsahu. Podezřelý profil lze nahlásit.",
  ],
  [
    "Jak počítáte statistiky?",
    "Zobrazení a kliknutí se zaznamenávají na serveru po souhlasu s měřením. Opakované odeslání stejné události se nepočítá dvakrát. Nové otevření stránky ano. Statistiky rozlišují načtení stránky s profilem, viditelnou kartu, detail a proklik. Přihlášeného majitele vynecháváme. Základní filtry omezují známé boty a hromadné požadavky. Nejde o auditované reklamní metriky.",
  ],
  [
    "Mohu získat peníze zpět?",
    "Požadavek řeší podpora podle platných podmínek a příslušných práv. Žádost o odstoupení nebo vrácení platby odešli na stránce /requests; k odstoupení není třeba uvádět důvod. Refundaci provádí Dodo. Potvrzená refundace odpovídajícím způsobem sníží hodnotu profilu.",
  ],
];
export function FAQ() {
  return (
    <Accordion type="single" collapsible className="faq-list">
      {faqs.map(([q, a], i) => (
        <AccordionItem value={String(i)} key={q}>
          <AccordionTrigger>{q}</AccordionTrigger>
          <AccordionContent>{a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
export function PrivacyButton() {
  return (
    <Button
      variant="outline"
      onClick={() => window.dispatchEvent(new Event("rankme:privacy"))}
    >
      Změnit nastavení cookies
    </Button>
  );
}
