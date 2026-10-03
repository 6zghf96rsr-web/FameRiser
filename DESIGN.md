# Výchozí design FameRiseru

**Schváleno uživatelem 21. 9. 2026: Obsidian Afterglow Signature, pistáciová C++ a fialová F+.** Tento návrh je výchozím vizuálním podkladem pro další vývoj FameRiseru. Nahrazuje předchozí návrhy se světlým levandulovým pódiem, tmavší zelenou a méně sytou fialovou.

## Schválená předloha

- [Interaktivní náhled](design/afterglow-signature/preview.html) — samostatně otevřitelný v prohlížeči; pro 3D scénu a fonty potřebuje internet.
- [Upravitelný zdroj návrhu](design/afterglow-signature/reference.fragment.html) — přesná kopie poslední schválené vizualizace, včetně geometrie, světel a interakcí.

Předloha určuje vzhled. Obsahuje ukázkové profily a lokální demonstrační ovládání; není napojená na účty, platby ani databázi aplikace. Vzhled je nyní převedený do komponent aplikace; referenční náhled slouží pro srovnání kompozice a materiálů. Stav zveřejnění ověřuje aktuální nasazení Sites.

## Schválená ikona aplikace

Uživatel 21. 9. 2026 schválil dodanou prostorovou ikonu: pistáciový monogram FR se vzestupnou šipkou a korunkou na fialovém zaobleném podkladu. Používat tento podklad, nikoli dřívější návrh jednoduchého F se šipkou.

- Originál: [fameriser-approved-original.png](design/brand/fameriser-approved-original.png).
- Export pro Meta, PNG 1024 × 1024: [fameriser-meta-1024.png](design/brand/fameriser-meta-1024.png).

## Barevnost vzhledu

| Role | Odstín | Použití |
| --- | --- | --- |
| Pozadí | `#100D15` | Tmavý obsidián s jemným fialovým nádechem; výchozí vzhled stránky |
| Pistáciová C++ | `#BDEB6D` | Hlavní výzvy k akci, aktivní akcenty, třetí místo |
| Fialová F+ | `#6D2D91` | Druhé místo, materiály a doprovodné akcenty |
| Zlato | `#F0CF87` | Vítěz, korunka a zvýraznění hlavního nadpisu |
| Hlavní text | `#F6F2EB` | Nadpisy, názvy a částky |
| Vedlejší text | `#B9B1C4` | Popisky a doprovodné informace |
| Linky | `#362E40` | Jemné oddělení tmavých ploch |

Pistáciová má zůstat svěží a výrazná i ve stínu. Netónovat ji zpět do tmavé olivové. Fialová je sytá, ale nemá vytvářet celoplošný neonový závoj. Odlesky a přechody mohou používat světlejší či tmavší odvozené tóny; základní odstíny zůstávají uvedené výše. Na pistáciových tlačítkách používat tmavý text (`#1B270E`), na fialových plochách světlý.

## Písmo a kompozice

- Hlavní nadpisy: **Barlow Condensed**, řezy 600/700. Běžné rozhraní: **DM Sans**, řezy 400–700.
- Výrazný úvod „MOST FAMOUS“ bez tečky, se schváleným logem FR hned za slovem FAMOUS, stručné vysvětlení, že pořadí určuje zaplacená částka, a jasná hlavní akce „Přidat svůj profil“.
- Úvodní stránka postupuje od navigace a úvodu přes síťové filtry k dominantnímu pódiu a přehlednému seznamu dalších profilů.
- **Logo schválené 22. 9. 2026:** propojené F + R s korunkou, ve výraznější modrofialové a pistáciové variantě z uživatelovy přílohy. Originál je `public/brand/fameriser-fr-approved.png`, optimalizovaná ikona pro záhlaví, patičku a favicon je `public/brand/fameriser-fr-icon.png`. Zachovat přesně tuto barevnou variantu loga; nejde o změnu základních barev celého webu. Logo je vložené i do referenčního návrhu.
- Na mobilu skládat obsah a ovládání pod sebe; důležité texty a částky musí zůstat čitelné od šířky 320 px.
- U jména veřejného profilu zobrazit vlajku a dvoupísmenný kód ověřené země (např. 🇨🇿 CZ), jednotně v žebříčku, na pódiu a v detailu. Štítek držet pohromadě, při nedostatku místa jej zalomit pod jméno. Chybějící nebo neplatnou zemi neodhadovat podle jména, jazyka, IP ani fakturace.

## Prostorové pódium

Použít skutečnou prostorovou scénu podle reference: nízká oválná tmavá základna, tři samostatné podstavce se zkosenými hranami, oddělené horní desky a tenké světelné mezery. Druhé místo je vlevo ve fialové, nejvyšší první místo uprostřed ve zlaté a třetí místo vpravo v pistáciové. Nad nimi jsou portrétní medailony; vítěz má drobnou korunku.

Materiály kombinují saténový obsidián, lesklou fialovou, kovové zlato a saténovou pistáciovou. Orientační hodnoty materiálů z předlohy:

| Materiál | Metalness | Roughness | Clearcoat |
| --- | ---: | ---: | ---: |
| Zlato | 0.88 | 0.20 | 0.42 |
| Fialová | 0.72 | 0.19 | 0.42 |
| Pistáciová | 0.10 | 0.32 | 0.50 |

Jména, umístění a částky vykreslovat jako ostrý HTML text, který zůstane dostupný i bez WebGL. Skutečné fotografie a iniciály čerpat z existujících dat aplikace. Tvar pódia, světla a materiály posuzovat společně podle náhledu, ne pouze podle barev vzorníku.

Výška scény se musí přizpůsobit šířce pódia a skutečné výšce popisků. Celý portrét vítěze včetně korunky musí zůstat pod záhlavím, s rezervou pro pohyb a zvýraznění při ovládání. Platí i pro mobil a víceřádkové částky.

## Ovládání a pohyb

- Krátký jednorázový nástup světla a kamery, jemná reakce scény na pohyb ukazatele a nadzvednutí medailonu při najetí.
- Hlavní tlačítka mají jemnou hloubku; stisk je vizuálně zatlačí. Zvolené filtry působí zapuštěně.
- Řádky žebříčku se mohou mírně nadzvednout, jejich text se prostorově nenaklání.
- Bez nepřetržitého otáčení nebo rušivého blikání. Respektovat omezení pohybu v systému a nabídnout vypnutí pohybu scény.
- Mimo obrazovku vykreslování pozastavit. Při nedostupnosti WebGL zobrazit čitelnou statickou variantu pódia.
- Ovládání musí fungovat dotykem i klávesnicí; základní informace a akce nesmějí záviset na najetí myší. Zachovat viditelný fokus a dostatečný kontrast.

## Převod do aplikace

Při implementaci převést vzhled do stávajících komponent a využít jejich skutečná data a akce. Cílová aplikace používá nové pravidlo: jeden creator má jeden společný profil pro více ověřených sociálních účtů, v Global jeden řádek a skóre z potvrzených plateb v USD a FameCreditů. V soukromé první fázi jsou platby vypnuté; později přibudou Dodo a veřejný přístup. Zachovat stavy načítání, prázdných výsledků a chyb. Hodnocení ani design pořadí nemění.

Nevkládat celou demonstrační stránku místo fungující aplikace. Fiktivní profily a kreslené portréty z předlohy se nepřenášejí do produkčních dat. Reference používá Three.js 0.160.1 z CDN a volitelné nástroje hostitele vizualizace. Aplikace používá místní závislost Three.js a komponenty `signature-podium.tsx` / `podium-scene.js`; základní textové údaje a odkazy fungují i bez WebGL. Pohyb lze vypnout a respektuje systémové omezení. Rozbalovací informace uchovávají údaje o platbách, označení promo míst a návštěvu sociálního profilu.

Další vizuální úpravy odvozovat z tohoto základu. Novější výslovné rozhodnutí uživatele má přednost a patří promítnout do této specifikace i referenčního návrhu.

## Propojené účty a přihlášení (22. 9. 2026)

Propojené účty mají jeden hlavní přehled a jedno tlačítko „Přidat účet“. Výběr v dialogu obsahuje jen aktivní možnosti, Facebook profil a spravovaná stránka se rozlišují. Neaktivní integrace jsou pouze stručnou informací, rozpracované neověřené odkazy jsou sbalené zvlášť. Přihlašovací metody patří do nastavení účtu. Při přihlášení zobrazit dostupné sociální metody; stejné tlačítko slouží novému i stávajícímu uživateli. E-mail je rozbalovací alternativa. Zachovat ověření poskytovatelem, povinná potvrzení podmínek a výslovný souhlas se zveřejněním stránky po zaplacení.

## Veřejné částky (22. 9. 2026; překonáno 3. 10. 2026)

Historický popis se vztahoval na starý web. Nová verze ukazuje zvlášť agregát skutečně uznaných plateb v USD, FC a jejich společnou rankingovou hodnotu; jednotlivé platby a identita plátce jsou soukromé. FC nejsou zaplacené peníze ani příjem creatora. Pořadí se řídí novým kontraktem v1.1, při shodě časem dosažení a veřejným UUID. V soukromém pilotu je cash část nulová.

## Mobilní žebříček (22. 9. 2026)

Na šířkách do 1000 px jsou sítě v pevné mřížce 3 × 2, na větších šířkách 6 × 1. Most Famous má vlastní širší vycentrovaný řádek s fialovým ohraničením. Žádná síť nesmí zůstat osamocená ani vyžadovat vodorovné posouvání. Vedlejší navigace patří na mobilu do přístupné nabídky; účet zůstává přímo v záhlaví.

Do 700 px má úvod kompaktní nadpis a výzvu k přidání profilu. Vysvětlení pořadí je dostupné v rozbalovacím textu. Vyhledávání i všechny časové filtry zůstávají před profily. Výška pódia vychází z obsahu, s menší horní rezervou na mobilu a čitelným náhradním zobrazením bez WebGL. Změny rozměrů se slučují do následujícího animačního snímku, nesmějí synchronně měnit rozměry uvnitř ResizeObserver ani pokračovat po odstranění pódia.

## Cesta návštěvníka a tvůrce (22. 9. 2026)

Úvod zvýrazňuje „Objevovat profily“ s přímým přesunem do hledání; vedle je vstup pro tvůrce. Odkaz na původní síť je dostupný přímo u každého vítěze. Vítězové se nejprve zobrazí jako kompaktní karty v pořadí 1–2–3, na mobilu pod sebou. Na větší obrazovce lze přepnout na schválené 3D pódium. Výchozí přehled dává přednost jménům, tvorbě a návštěvě sítě už v první obrazovce. Zachovat tmavý vzhled a zlatý/fialový/pistáciový akcent umístění.

V první soukromé fázi tvůrce vidí postup Registrace → Jeden creator profil → Ověření sociálního účtu → Výslovná volba zveřejnění v pilotu → Žebříček. Za každý nový odlišný ověřený účet se jednou přidělí 1 FC, nejvýše 10. Staré promo ani checkout nejsou součástí této cesty. Po připojení Dodo přibude nákup podle nových pravidel. Podrobnosti ověření jsou rozbalovací a nastavení účtu nepředchází samotnému profilu.
