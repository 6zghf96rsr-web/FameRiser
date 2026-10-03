import { notFound, redirect } from "next/navigation";
import { LEGAL_URLS } from "@/lib/rankme/legal";
import { ArrowUpRight, Eye, MousePointer2, Users, Zap } from "lucide-react";
import { PageShell, DemoNote } from "@/components/rankme/shell";
import { FAQ, PrivacyButton } from "@/components/rankme/info";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/rankme/board";
import { getBoard } from "@/lib/rankme/data";
import { adminDB, configured, demoEnabled } from "@/lib/supabase/server";
import { money, number, combinedPlacementSummary, periodScore, rankingSummary, paidSummary } from "@/lib/rankme/config";
const titles: Record<string, [string, string, string]> = {
  "how-it-works": [
    "Žádný algoritmus. Jasná pravidla.",
    "JAK TO FUNGUJE",
    "Vyšší částka. Vyšší pozice. Je to tak jednoduché.",
  ],
  faq: [
    "Dobré otázky. Přímé odpovědi.",
    "FAQ",
    "Všechno, co potřebuješ vědět před cestou nahoru.",
  ],
  stats: [
    "Žebříček v číslech.",
    "STATISTIKY",
    "Průhledná pravidla si zaslouží průhledná data.",
  ],
  terms: [
    "Podmínky služby",
    "PRAVIDLA",
    "Jak funguje placené reklamní umístění.",
  ],
  privacy: [
    "Tvoje soukromí",
    "OSOBNÍ ÚDAJE",
    "Co zpracováváme a jak můžeš svá data spravovat.",
  ],
  cookies: [
    "Cookies pod kontrolou",
    "SOUKROMÍ",
    "Ty rozhoduješ o volitelném měření.",
  ],
  contact: [
    "Jsme na stejné straně.",
    "KONTAKT",
    "Nahlášení, osobní údaje nebo dotaz k platbě.",
  ],
  guidelines: [
    "Prostor, kde je fér být vidět.",
    "KOMUNITNÍ PRAVIDLA",
    "Stejná pravidla platí pro každou pozici.",
  ],
};
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  return {
    title: `${titles[page]?.[0] || "Stránka nenalezena"} — FameRiser`,
    alternates: { canonical: `${process.env.APP_URL || ""}/${page}` },
  };
}
export default async function InfoPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (["terms","guidelines","contact","refunds","ranking","cookies","promo"].includes(page)) redirect(`/policies/${page}`);
  if (page === "privacy") redirect(LEGAL_URLS.privacy);
  if (page === "data-deletion") redirect(LEGAL_URLS.deletion);
  const title = titles[page];
  if (!title) notFound();
  const b = await getBoard();
  const total = b.profiles.reduce((s, p) => s + periodScore(p), 0),
    views = b.profiles.reduce((s, p) => s + p.views, 0),
    clicks = b.profiles.reduce((s, p) => s + p.clicks, 0);
  const support = process.env.SUPPORT_EMAIL;
  const legalReady = Boolean(
    process.env.BUSINESS_NAME &&
    process.env.BUSINESS_ADDRESS &&
    process.env.BUSINESS_ID &&
    support,
  );
  return (
    <PageShell
      title={title[0]}
      eyebrow={title[1]}
      description={title[2]}
      name={b.settings.name}
      wide={page === "stats" || page === "how-it-works"}
    >
      {page === "faq" && <FAQ />}
      {page === "how-it-works" && (
        <>
          <div className="how-grid">
            {[
              [
                "01",
                "Propoj účet zdarma.",
                "Nejdříve ověř přístup ke svému sociálnímu účtu. Teprve potom se propojení dokončí. Propojení i ověření je zdarma; bez platby nebo získaného promo místa zůstane účet soukromý. Promo i placené umístění vyžaduje ověření. Prohlížet profily můžeš bez registrace, komentovat po přihlášení.",
              ],
              [
                "02",
                "Zaplať zveřejnění.",
                "Vyber jednorázovou částku v podporované měně. Konečnou cenu včetně daně uvidíš před platbou. Vyšší RankScore může zlepšit pozici; konkrétní místo není zaručené.",
              ],
              [
                "03",
                "Buď vidět.",
                "Ověřený profil se po doplnění údajů a jedné potvrzené platbě objeví v žebříčku své sítě i ve společném žebříčku. V obou rozhoduje RankScore podle pravidel plateb a kurzů. Kliknutí otevře náhled, komentáře a odkaz na původní účet. Bez platného ověření se profil nezobrazí.",
              ],
            ].map(([n, h, p]) => (
              <article key={n}>
                <span>{n}</span>
                <h2>{h}</h2>
                <p>{p}</p>
              </article>
            ))}
          </div>
          <div className="editorial-content">
            <h2>Každá platba zvyšuje tvůj součet.</h2>
            <p>Platíš pouze nově zvolenou částku. Pro pořadí se přičítá RankScore z částky bez skutečné daně, přepočtené pevným referenčním kurzem pro danou platbu. Poplatky platební brány skóre nesnižují.</p>
            <p>U profilu je vidět součet uhrazených částek v původních měnách, po odečtení vratek. Podrobná pravidla najdeš v <a href="/policies/ranking">pravidlech žebříčku</a>.</p>
            <section>
              <h2>Pozornost si hledá cestu.</h2>
              <p>
                Kupuješ reklamní pozici. Jiný uživatel tě může kdykoliv
                překonat. Počet zobrazení, kliknutí ani followerů není zaručený.
              </p>
            </section>
            <Button className="primary-button" asChild>
              <a href="/join">
                Získat svoje místo <ArrowUpRight size={16} />
              </a>
            </Button>
          </div>
        </>
      )}
      {page === "stats" && (
        <>
          {b.demo && <DemoNote />}
          {b.error && <div className="form-error">{b.error}</div>}
          <div className="metric-grid">
            <div>
              <Users />
              <span>{b.demo ? "Fiktivních profilů" : "Aktivních profilů"}</span>
              <strong>{number(b.profiles.length)}</strong>
            </div>
            <div>
              <Eye />
              <span>Zobrazení profilů</span>
              <strong>{number(views)}</strong>
            </div>
            <div>
              <MousePointer2 />
              <span>Návštěvy sociálních sítí</span>
              <strong>{number(clicks)}</strong>
            </div>
            <div>
              <Zap />
              <span>
                {b.demo ? "Ukázková hodnota" : "Celková hodnota profilů"}
              </span>
              <strong>{combinedPlacementSummary(b.profiles)}</strong>
            </div>
          </div>
          <div className="stats-chart">
            <h2>Podíl podle skóre sociální sítě</h2>
            {[...new Set(b.profiles.map((p) => p.platform))].map((platform) => {
              const paid = b.profiles
                .filter((p) => p.platform === platform)
                .reduce((s, p) => s + periodScore(p), 0);
              return (
                <div className="chart-row" key={platform}>
                  <span>{platform}</span>
                  <div className="chart-track">
                    <span
                      style={{
                        width: total ? (paid / total) * 100 + "%" : "0%",
                      }}
                    />
                  </div>
                  <strong>{combinedPlacementSummary(b.profiles.filter(p=>p.platform===platform))}</strong>
                </div>
              );
            })}
            <p className="stats-note">
              {b.demo
                ? "Částky vycházejí z označených fiktivních seed dat. Zobrazení a kliknutí nejsou vymyšlená: v demu se neměří."
                : "Částky vycházejí z potvrzených plateb po odečtení refundací u aktivních profilů. Nejde o kompletní účetní přehled příjmů."}
            </p>
          </div>
          <h2 className="tab-title">Trending profiles</h2>
          <p className="subtle-note">
            Pořadí v této sekci vychází ze zobrazení a kliknutí. Nemění placený
            žebříček.
          </p>
          {b.profiles.some((p) => p.views || p.clicks) ? (
            <div className="trending-grid">
              {[...b.profiles]
                .filter((p) => p.views || p.clicks)
                .sort(
                  (a, c) => c.views + c.clicks * 3 - (a.views + a.clicks * 3),
                )
                .slice(0, 3)
                .map((p) => (
                  <a href={`/p/${p.slug}`} key={p.id}>
                    <Avatar p={p} size="large" />
                    <h3>{p.name}</h3>
                    <p>
                      {number(p.views)} zobrazení · {number(p.clicks)} kliknutí
                    </p>
                  </a>
                ))}
            </div>
          ) : (
            <div className="notice">
              Zatím nemáme dost skutečných návštěv pro výpočet trendů.
            </div>
          )}
          <p className="stats-note">
            Zobrazení zahrnují samostatně viditelnou kartu a otevření detailu.
            Opakované odeslání stejné události se nezapočítá dvakrát. Poměr
            kliknutí ke zobrazení je orientační. Počet online lidí ani
            unikátních návštěvníků neuvádíme, pokud pro ně nejsou spolehlivá
            data.
          </p>
        </>
      )}
      {["terms", "privacy", "cookies", "contact", "guidelines"].includes(
        page,
      ) && (
        <div className="editorial-content">
          {!legalReady && ["terms", "privacy", "contact"].includes(page) && (
            <div className="notice">
              Pilotní verze. Před zahájením placeného provozu musí provozovatel
              doplnit svou identitu, kontaktní údaje a dokončit tyto dokumenty
              pro konkrétní službu. Platby jsou do té doby vypnuté.
            </div>
          )}
          {page === "terms" && (
            <>
              <section>
                <h2>1. Provozovatel a služba</h2>
                <p>
                  {legalReady
                    ? `${process.env.BUSINESS_NAME}, ${process.env.BUSINESS_ADDRESS}, IČO ${process.env.BUSINESS_ID}. Kontakt: ${support}.`
                    : "Identifikační a kontaktní údaje provozovatele zatím nebyly nastavené."}{" "}
                  {b.settings.name} poskytuje reklamní umístění sociálních
                  profilů ve veřejném placeném žebříčku.
                </p>
              </section>
              <section>
                <h2>2. Určení pořadí</h2>
                <p>
                  Pořadí v Celkově určuje součet potvrzených plateb daného
                  profilu snížený o refundace. Při shodě má přednost dřívější
                  dosažení částky. 24 hodin zahrnuje pouze platby z posledních 24
                  hodin.
                </p>
                <p>
                  Nejde o objektivní hodnocení osoby, její kvality nebo
                  popularity. Platba nepředstavuje doporučení provozovatele.
                </p>
              </section>
              <section>
                <h2>3. Platby a rozsah reklamy</h2>
                <p>
                  Platíš za zařazení a hodnotu reklamní pozice. Umístění se může
                  kdykoliv změnit, zejména dalšími platbami ostatních uživatelů.
                  Počet zobrazení, návštěv, kliknutí ani sledujících není
                  garantovaný. Jde o jednorázovou platbu bez předplatného.
                </p>
                <p>
                  Při navýšení stávajícího profilu platíš pouze rozdíl mezi
                  novou cílovou hodnotou a dosud zaplacenou částkou. Platba se
                  započítá až po potvrzení od Stripe. Odhad před platbou není
                  příslibem konkrétního umístění.
                </p>
              </section>
              <section>
                <h2>4. Vlastnictví a obsah</h2>
                <p>
                  Potvrzuješ vlastnictví profilu nebo oprávnění jej propagovat.
                  Nesmíš vkládat nezákonný obsah, podvody, škodlivé odkazy ani
                  se vydávat za jinou osobu. Platí{" "}
                  <a href="/guidelines">komunitní pravidla</a>. Správce může
                  obsah prověřit, skrýt nebo zablokovat.
                </p>
              </section>
              <section>
                <h2>5. Reklamace a refundace</h2>
                <p>
                  Dotazy k platbě a reklamace řeší podpora. Tato pilotní verze
                  ještě nestanovuje úplný postup uzavření smlouvy, zahájení
                  služby a spotřebitelského odstoupení. Zákonná práva
                  spotřebitele nejsou tímto textem vyloučena. Před placeným
                  spuštěním provozovatel doplní postup a lhůty pro reklamace a
                  refundace.
                </p>
              </section>
            </>
          )}
          {page === "cookies" && (
            <>
              <section>
                <h2>Nezbytné cookies</h2>
                <p>
                  Udržují přihlášení, bezpečnost relace a tvoji volbu soukromí.
                  Nastavení vzhledu se ukládá pouze na tomto zařízení. Použitá
                  služba přihlášení může potřebovat další nezbytné cookies pro
                  ověření.
                </p>
              </section>
              <section>
                <h2>Volitelné měření</h2>
                <p>
                  Po souhlasu aplikace zaznamenává stránku žebříčku s profilem, viditelnou kartu, návštěvu
                  detailu a kliknutí na sociální síť. Stejnou odeslanou událost
                  nezapočítá dvakrát. Souhlas si pamatuje nejdéle jeden rok.
                  Odvolání souhlasu zastaví nové měření; pro žádost o odstranění
                  dřívějších údajů použij kontakt na správce.
                </p>
              </section>
              <section>
                <h2>Změna rozhodnutí</h2>
                <p>
                  Volitelné měření můžeš kdykoliv povolit nebo vypnout. Bez jeho
                  povolení můžeš používat žebříček i účet.
                </p>
                <PrivacyButton />
              </section>
            </>
          )}
          {page === "contact" && (
            <>
              <section>
                <h2>Podpora a osobní údaje</h2>
                {support ? (
                  <p>
                    Napiš nám na <a href={`mailto:${support}`}>{support}</a>. U
                    dotazu na platbu přidej její identifikátor z historie. Nikdy
                    neposílej údaje platební karty ani heslo.
                  </p>
                ) : (
                  <p>
                    Kontaktní e-mail provozovatele zatím není nastavený. Tato
                    pilotní verze nepřijímá platby.
                  </p>
                )}
              </section>
              <section>
                <h2>Podezřelý profil?</h2>
                <p>
                  Otevři detail profilu a použij tlačítko „Nahlásit profil“.
                  Vyber důvod a doplň souvislosti pro moderátora.
                </p>
              </section>
            </>
          )}
          {page === "guidelines" && (
            <>
              <section>
                <h2>Propaguj to, co je tvoje.</h2>
                <p>
                  Vkládej pouze vlastní sociální profily nebo profily, které
                  smíš propagovat. Cizí identita ani zavádějící ověření do
                  žebříčku nepatří.
                </p>
              </section>
              <section>
                <h2>Bez podvodů a škodlivého obsahu.</h2>
                <ul>
                  <li>
                    Žádné phishingové stránky, malware, podvody nebo obcházení
                    kontroly odkazů.
                  </li>
                  <li>
                    Žádný nezákonný obsah, vyhrožování, obtěžování ani obsah pro
                    dospělé.
                  </li>
                  <li>
                    Žádný spam, manipulace statistik ani vytváření klamných
                    profilů.
                  </li>
                </ul>
              </section>
              <section>
                <h2>Moderace platí pro všechny.</h2>
                <p>
                  Zaplacená částka neposkytuje výjimku z pravidel. Nahlášení
                  posoudí správce. Profil může být prověřován, skryt nebo
                  zablokován. Oprávněný vlastník může požádat o nápravu přes
                  podporu.
                </p>
              </section>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}
