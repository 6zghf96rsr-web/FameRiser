import publicPrivacy from "./privacy-snapshot.json" with {type:"json"};
// Published versions and accepted snapshots are immutable.
export const POLICY_VERSION = '2026-09-22.7';
// Existing account registration remains valid; archived acceptances are never rewritten.
export const ACCOUNT_ACCEPTANCE_VERSIONS = ['2026-09-22.3', '2026-09-22.4', '2026-09-22.5', '2026-09-22.6', POLICY_VERSION];
export const SUPPORT_EMAIL = 'info@fameriser.com';
export const policies = {
terms: {
  "title": "Podmínky služby FameRiser",
  "sections": [
    [
      "Co si objednáváš",
      "FameRiser umožňuje objevovat sociální profily a objednat jejich reklamní umístění. Účet a ověření kontroly profilu jsou zdarma. Návštěvníci mohou procházet veřejné žebříčky bez registrace. Platba jednorázově přidá RankScore konkrétnímu ověřenému profilu; nejde o předplatné, investici, sázku ani nákup sledujících. Pořadí není hodnocením popularity, kvality nebo důvěryhodnosti."
    ],
    [
      "Věk, přihlášení a oprávnění",
      "Účet a nákupy jsou pro osoby od 18 let. Potřebuješ potvrzený kontaktní e-mail. Přidat lze pouze vlastní sociální profil nebo profil, který jsi oprávněn zastupovat. Zveřejnění vyžaduje platné ověření kontroly a zaplacení nebo přidělené promo místo. U Facebook stránek vyžadujeme oprávnění ke správě, výslovné potvrzení zveřejnění vybrané stránky a úspěšnou platbu; promo kredit se na ně nevztahuje. Samotné načtení nebo propojení stránku nezveřejní. Ověření není úředním ověřením totožnosti ani doporučením obsahu. Hesla sociálních sítí zadávej pouze příslušnému poskytovateli, nikdy FameRiser."
    ],
    [
      "Objednávka a její potvrzení",
      "První vklad i každá další jednotlivá platba za navýšení musí být nejméně 5 USD včetně daní, pro všechny účty, stránky a sítě. V ostatních nabízených měnách použijeme ekvivalent podle posledního dostupného referenčního kurzu ECB z obchodního dne před UTC dnem objednávky, zaokrouhlený nahoru na nejmenší jednotku měny. Minimum kontrolujeme znovu při vytvoření objednávky. Dosavadní platby ani promo kredit minimální novou platbu nesnižují. Před nákupem zkontroluješ profil, částku, měnu, konečnou cenu včetně daní a podmínky. Chyby oprav před závazným potvrzením platby. Připsání skóre vyžaduje potvrzenou úhradu, nikoli pouhé otevření platební stránky. Přijatá verze podmínek a potvrzení objednávky se uchovají a lze si je uložit. Automatické opakované platby nejsou součástí služby. Dodo Payments je plánovaný Merchant of Record; konkrétní prodávající a konečné platební podmínky budou před zapnutím nákupů uvedeny v checkoutu a dokladu."
    ],
    [
      "Trvání umístění",
      "Jednorázovým nákupem přidáš skóre bez předem nastaveného konce v celkovém žebříčku. Umístění trvá, dokud služba funguje, profil splňuje pravidla, zůstává ověřený a jeho zveřejnění neukončíš. Nejde o příslib doživotního provozu nebo pevné pozice. Časové žebříčky zobrazují jen příspěvky z příslušného období. Odpojení či ztráta ověření mohou profil skrýt; opětovné ověření podléhá kontrole stejného účtu. Skóre nelze vyplatit, převést na jiného uživatele ani prodat."
    ],
    [
      "Co je a není garantováno",
      "Poskytujeme umístění podle zveřejněných pravidel a dostupné statistiky. Negarantujeme konkrétní místo, počet zobrazení, návštěv, sledujících, zákazníky ani příjem. Jiný profil tě může předběhnout. Nulový počet návštěv sám o sobě neprokazuje vadu služby; nezobrazení způsobilého zaplaceného profilu nebo chybné připsání skóre naopak může být důvodem reklamace. Statistiky mohou být neúplné kvůli odmítnutému měření, blokování a technickým omezením."
    ],
    [
      "Tvůj obsah a oprávnění k jeho použití",
      "Vlastnictví obsahu ti zůstává. Poskytuješ nám nevýhradní oprávnění uchovat, technicky upravit rozměry a zobrazit tebou vložený obsah ve FameRiser pro provoz profilu, komentářů a jejich náhledů. Nezahrnuje samostatné použití tvé podobizny v externí reklamní kampani bez dalšího svolení. Musíš mít oprávnění k fotografii, bio, názvu i dalším údajům. Import je volitelný. Oprávnění končí odstraněním obsahu, kromě nezbytných záloh, řešení sporů a zákonného uchování."
    ],
    [
      "Veřejnost profilu a komentářů",
      "Zveřejněný profil, souhrnnou hodnotu umístění, pořadí a veřejné příspěvky mohou vidět ostatní a indexovat vyhledávače. Kontaktní e-mail a platební doklady veřejné nejsou. Komentář může obsahovat volitelné hvězdičky, odpovědi a reakce; nejde o ověřenou recenzi nákupu. Platba ani promo neposkytují právo na odstranění oprávněné kritiky. Zakázaný obsah řeší komunitní pravidla."
    ],
    [
      "Dostupnost a ukončení",
      "K použití potřebuješ aktuální běžný prohlížeč a internet. O plánované zásadní odstávce informujeme předem, pokud je to možné. Při plánovaném definitivním ukončení služby poskytneme alespoň 30 dní na export dostupných údajů a uplatnění nároků, nebrání-li tomu právní či bezpečnostní důvod. Vady, neposkytnuté plnění a nevyčerpané nároky vypořádáme podle pravidel reklamací; samotné ukončení neznamená automatické propadnutí plateb."
    ],
    [
      "Změny pravidel",
      "Každé znění má datum a archiv. Podstatné změny oznámíme přihlášeným uživatelům alespoň 30 dní předem, vyjma nezbytných právních nebo bezpečnostních změn. Nová pravidla nepoužijeme zpětně ke zrušení vzniklých nároků či zaplaceného skóre. Nové nákupy vyžadují přijetí aktuální verze. Odmítnutí nových podmínek nesmí bránit přístupu k zákonným právům, reklamaci nebo výmazu."
    ],
    [
      "Odpovědnost a řešení sporů",
      "Povinná práva spotřebitele ani odpovědnost, kterou nelze zákonně vyloučit, nejsou omezena. Pro vztah s českým provozovatelem se použije české právo, aniž by spotřebitel ztratil povinnou ochranu země svého obvyklého bydliště. Nevynucujeme vzdání se soudu nebo povinnou soukromou arbitráž. Příslušnost mimosoudního řešení se řídí stranami konkrétní smlouvy; pro spotřebitelský spor s českým provozovatelem přichází v úvahu ČOI. Podrobnosti jsou v pravidlech reklamací."
    ],
    [
      "Stav přípravy",
      "Hlavní aplikace je soukromý pilot; ostré platby nejsou spuštěné. Promo zařazení se řídí aktuální dostupností v aplikaci. Text popisuje současný pilot i připravená pravidla budoucí placené služby. Identita provozovatele, konečné kontaktní údaje a smluvní nastavení Dodo budou doplněny před spuštěním. Tento dokument neznamená, že Dodo nebo sociální sítě projekt schválily."
    ]
  ]
},
ranking: {
  "title": "Pravidla reklamního žebříčku",
  "sections": [
    [
      "Jak se počítá pořadí",
      "Most Famous zahrnuje způsobilé profily ze všech sítí; Instagram Fame, Facebook Fame a další žebříčky jen příslušnou síť. Pořadí určuje sestupně RankScore, nikoli počet sledujících, hvězdičky nebo komentáře. Každý profil soutěží vlastním skóre; propojení více sítí neslučuje jejich platby."
    ],
    [
      "RankScore a měny",
      "U připravených plateb Dodo se skóre počítá z hodnoty služby bez skutečně účtované DPH nebo sales tax. Přepočet do EUR používá poslední dostupný referenční kurz ECB z obchodního dne před UTC dnem potvrzení platby. Skóre se ukládá s přesností na miliontinu EUR, se zaokrouhlením dolů. Datum a kurz zůstávají u platby; pozdější pohyb měny skóre nemění. Poplatek brány se neodečítá. Nejde o směnu peněz ani kurz účtovaný bankou. Bez ověřeného daňového základu a kurzu se platba ke skóre nepřičte, dokud se nesrovnalost nevyřeší."
    ],
    [
      "Veřejné částky",
      "Veřejně zobrazujeme „Hodnotu umístění“: součet skutečně uhrazených částek po vrácení peněz a přidělených promo kreditů, odděleně podle měn. Uhrazované částky zahrnují účtované daně. Nejde o údaj o tom, kolik uživatel zaplatil. Jednotlivé platby ani rozdělení na platby a promo kredit veřejně nezobrazujeme; rozpis má vlastník v soukromém účtu. Hodnota umístění se proto může lišit od RankScore. Skóre nemá peněžní zůstatek k výběru. Starší platby nelze bez doloženého přepočtu přeznačit na jinou měnu."
    ],
    [
      "Období a shodné skóre",
      "Celkový žebříček sčítá aktivní skóre potvrzených plateb a přidělených promo kreditů. Přepínače 24 hodin, týden a měsíc znamenají klouzavých 24 hodin, 7 dní a 30 dní, nikoliv kalendářní období. Při shodném skóre rozhoduje čas prvního přihlášení (registrace účtu FameRiser), poté čas vytvoření profilu a stálý identifikátor. Toto pravidlo platí i po dalších platbách. Opakované přihlášení pořadí nemění. Vrácení platby nebo spor může skóre snížit; po potvrzení změny se pořadí přepočítá. Neúspěšná či nedokončená platba pořadí nezmění."
    ],
    [
      "Zveřejnění a promo",
      "Bez ověření se profil nezobrazí ani po platbě. Platba odblokuje umístění pouze při splnění ostatních pravidel. Přidělené promo místo má stejné funkce a statistiky jako placené umístění. Facebook stránky vyžadují souhlas se zveřejněním a skutečnou platbu; promo kredit se na ně nevztahuje. Promo kredit se ke skóre přičítá odděleně od skutečných plateb. Pořadí promo profilů se stejným skóre určuje první registrace účtu FameRiser. Podrobnosti stanoví samostatná pravidla promo akce."
    ],
    [
      "Filtry a země",
      "Filtry sítě, tvorby, jazyka a lokality omezují zobrazenou skupinu. Kategorie a popis jsou údaje uživatele, nikoliv odborná certifikace. Národní žebříček vyžaduje ověřenou zemi; fakturační země je jen podpůrný údaj a nedokazuje občanství. Změnu země posuzuje správce. Země sama nemění hodnotu plateb."
    ],
    [
      "Význam statistik",
      "Otevření stránky žebříčku znamená načtení stránky obsahující profil, nikoliv nutně jeho přečtení. Zobrazení karty a zobrazení jména se měří samostatně při splnění podmínek viditelnosti. Dále sledujeme otevření detailu a přechod na původní sociální profil. Měření funguje se souhlasem návštěvníka; nezjišťuje, zda následně začal sledovat účet nebo nakoupil. Události nejsou totožné s unikátními lidmi. Statistiky slouží k přehledu, nikoliv jako garance budoucího dosahu."
    ]
  ]
},
refunds: {
  "title": "Reklamace, vrácení plateb a odstoupení",
  "sections": [
    [
      "Jak podat žádost",
      "V aplikaci otevři /requests a zvol Odstoupit od smlouvy nebo Reklamace / vrácení platby. Uveď jméno, kontaktní e-mail a identifikátor objednávky či platby. Pokud identifikátor nemáš, požádej o dohledání pomocí dalších dostupných údajů; neposílej číslo karty nebo heslo. Podání nevyžaduje přihlášení. V soukromém pilotu může být celý web omezený; tehdy použij kontaktní e-mail. Potvrzení v aplikaci obsahuje číslo případu a čas přijetí a lze je uložit. Provozní potvrzení odesíláme také e-mailem."
    ],
    [
      "Odstoupení spotřebitele do 14 dnů",
      "Spotřebitel může od smlouvy sjednané na dálku odstoupit bez udání důvodu do 14 dnů od jejího uzavření, není-li zákonná lhůta delší. Stačí jednoznačné oznámení odeslat ve lhůtě; náš formulář není jedinou možností. Každá nová objednávka má vlastní lhůtu. Zahájení umístění ani připsání skóre samo neznamená úplné splnění průběžné služby nebo automatickou ztrátu práva na odstoupení."
    ],
    [
      "Předčasné zahájení a poměrná úhrada",
      "Před platbou žádáš zvlášť o zahájení služby před koncem lhůty pro odstoupení. Při odstoupení lze zohlednit pouze zákonnou, přiměřenou a doložitelnou část skutečně poskytnuté služby, pokud byly splněny všechny podmínky a informační povinnosti. Nepoužíváme automatickou procentní srážku, sankci za odstoupení ani srážku podle dosaženého místa. Pokud poměrnou úhradu neumíme právně a věcně doložit, neuplatníme ji. Žádost o okamžité zahájení není blanketním vzdáním se spotřebitelských práv."
    ],
    [
      "Vrácení peněz",
      "Při oprávněném spotřebitelském odstoupení se peníze vracejí bez zbytečného odkladu, nejpozději do 14 dnů od doručení oznámení, s případným zákonným vypořádáním poskytnuté části služby. Použije se původní platební prostředek, pokud se nedohodneme jinak bez dalších nákladů pro spotřebitele. U plateb přes Merchant of Record probíhá refundace přes původního prodávajícího; interní schválení nebo čekání na bránu samo zákonnou lhůtu neprodlužuje. Konkrétní proces Dodo bude dokončen před spuštěním nákupů."
    ],
    [
      "Co je vada služby",
      "Reklamovat lze například nepřipsanou potvrzenou platbu, chybně vypočtené skóre nebo nedostupné umístění profilu, který splňuje pravidla. Popiš očekávané a skutečné chování, dobu výskytu a požadované řešení. Nákup neslibuje určité místo nebo návštěvnost; předběhnutí jiným profilem či nízký dosah samy nejsou vadou. Tím nejsou omezeny nároky při skutečně neposkytnuté službě, klamavé informaci nebo jiné vadě."
    ],
    [
      "Vyřízení reklamace",
      "Potvrdíme přijetí a reklamaci řešíme bez zbytečného odkladu, v přiměřené lhůtě odpovídající povaze vady. Pro digitální služby nelze obecně považovat 30 dní za automaticky přiměřenou dobu. Pro naše vyřizování stanovujeme nejvýše 30 dní, ledaže se výslovně dohodneme na delší době; kratší zákonná nebo vzhledem k vadě přiměřená lhůta má přednost. O výsledku, nápravě a případném zamítnutí s důvodem tě vyrozumíme. Podle povahy vady a zákonných podmínek připadá v úvahu oprava, přiměřená sleva nebo odstoupení; zákonné nároky na náklady či náhradu újmy zůstávají zachovány."
    ],
    [
      "Ostatní žádosti a moderace",
      "Mimo zákonné nároky nevzniká automatické právo na refundaci pouze kvůli změně názoru, překonání nebo nízké návštěvnosti. Každou žádost posoudíme. Zablokování profilu neznamená bez dalšího propadnutí celé platby; rozhodnutí popíše dopad na objednávku a možnosti přezkumu. Potvrzená refundace sníží související skóre a veřejný součet. Podání reklamace nebo odvolání není samo důvodem k postihu."
    ],
    [
      "Vzor oznámení o odstoupení",
      "Adresát: provozovatel nebo prodávající uvedený v objednávce, doručení prostřednictvím /requests nebo zveřejněného kontaktu. Text: Oznamuji, že odstupuji od smlouvy o reklamním umístění FameRiser. Číslo objednávky: … Datum uzavření: … Jméno a příjmení: … Adresa: … Kontaktní e-mail: … Datum oznámení: … Podpis pouze při listinném podání. Tento vzor je dobrovolný; důvod odstoupení se nevyžaduje."
    ],
    [
      "Mimosoudní řešení",
      "Nejprve se můžeš obrátit přímo na nás nebo na prodávajícího v dokladu. U spotřebitelského sporu s českým provozovatelem může být příslušná Česká obchodní inspekce, informace a formulář na https://coi.gov.cz/informace-o-adr/. Návrh se podává nejpozději do jednoho roku od prvního uplatnění práva u podnikatele. Příslušnost pro samostatný spor s Merchant of Record závisí na jeho smluvní entitě. Mimosoudní cesta neomezuje právo obrátit se na soud."
    ]
  ]
},
guidelines: {
  "title": "Komunitní pravidla, oznámení a odvolání",
  "sections": [
    [
      "Základní pravidla",
      "Nevydávej se za jiného člověka, nepřipojuj cizí účet bez oprávnění a neobcházej ověření. Zakázány jsou podvody, phishing, malware, výhrůžky, obtěžování, nezákonné nenávistné projevy, sexuální obsah, porušování autorských práv a ochranných známek, neoprávněné zveřejňování soukromých údajů a další nezákonný obsah. Nevkládej citlivé údaje či intimní materiály třetích osob. Pravidla se vztahují na profil, fotografii, bio, komentáře, odpovědi a reakce."
    ],
    [
      "Kritika a reakce",
      "Věcná kritika a negativní zkušenost nejsou samy důvodem k odstranění. Nezveřejňuj výhrůžky, cílené ponižování, spam, opakované obtěžování nebo vědomě nepravdivá tvrzení. Hvězdičky u komentáře neoznačujeme za ověřenou nákupní recenzi. Autor profilu může odpovědět; počet reakcí ani výše platby neurčují výsledek moderace."
    ],
    [
      "Politická propagace",
      "V první verzi nepřijímáme placenou politickou a volební propagaci, kampaně politických stran a kandidátů ani kampaně směřující k ovlivnění voleb nebo legislativních procesů. Totéž platí pro jejich promo umístění. Omezení kampaní neznamená automatický zákaz běžné osobní debaty. Politické přesvědčení neodvozujeme z osobních údajů návštěvníků."
    ],
    [
      "Jak oznámit problém",
      "Použij Nahlásit obsah na profilu nebo /report. Uveď přesnou adresu a umístění obsahu, srozumitelný popis problému a důvody nezákonnosti nebo porušení pravidel. Přilož jen nezbytné, bezpečné důkazy. Formulář obsahuje kontakt a prohlášení o přesnosti a dobré víře; zvláštní zákonné výjimky z požadavku identifikačních údajů respektujeme. Neposílej kopie nezákonných intimních materiálů, zejména materiálů zachycujících zneužívání dětí; stačí přesný odkaz a popis. Při bezprostředním ohrožení kontaktuj také příslušné tísňové orgány."
    ],
    [
      "Potvrzení a posouzení",
      "Elektronické oznámení dostane číslo případu a potvrzení v aplikaci; při poskytnutí použitelného e-mailu odesíláme potvrzení a následné vyrozumění. Oznámení posuzujeme včas, pečlivě, objektivně a přiměřeně, s prioritou závažného ohrožení. Nerozhoduje automaticky počet hlášení. O běžných oznámeních rozhoduje člověk, ne AI. Technické filtry mohou odmítnout škodlivý odkaz nebo neplatný vstup. Při nedostatku podkladů si vyžádáme upřesnění."
    ],
    [
      "Možná opatření a důvody",
      "Podle závažnosti můžeme požádat o opravu, omezit či skrýt konkrétní obsah, pozastavit zveřejnění profilu nebo zablokovat účet. Pokud lze problém odstranit mírnějším opatřením, upřednostníme je. Dotčený uživatel obdrží důvod, rozhodné skutečnosti, použité pravidlo či právní základ, rozsah a trvání omezení, dopad na platbu a možnosti nápravy, pokud sdělení nebrání zákon. Kontakty oznamovatele a soukromé důkazy běžně nezveřejňujeme; jejich případné zákonné zpřístupnění posoudíme samostatně."
    ],
    [
      "Bezplatný přezkum",
      "U omezení obsahu nebo účtu můžeš požádat o přezkum přes /requests nebo kontaktní e-mail alespoň po dobu šesti měsíců od oznámení rozhodnutí. Uveď číslo rozhodnutí a proč s ním nesouhlasíš; můžeš dodat nové podklady. Přezkum vede člověk, pokud možno jiný než původní hodnotitel. Je-li nesprávnost prokázána, rozhodnutí napravíme bez zbytečného odkladu. Podání je bezplatné, nevyžaduje nový nákup a neomezuje soudní ochranu ani další prostředky, které ti přiznává DSA nebo jiné předpisy."
    ],
    [
      "Zneužití a transparentnost",
      "Zjevně neopodstatněná opakovaná oznámení posuzujeme individuálně, se zohledněním četnosti, závažnosti a okolností; nejde o důvod ignorovat nové věrohodné podání. Pokud uplatníme omezení podávání, sdělíme důvod a možnost přezkumu. Zákonné žádosti orgánů evidujeme a poskytujeme jen nezbytné údaje. Zprávy o moderaci zveřejníme, pokud pro nás vznikne zákonná povinnost; nezveřejňujeme osobní údaje účastníků jednotlivých případů."
    ]
  ]
},
privacy: {
  "title": "Zásady ochrany osobních údajů",
  "sections": [
    [
      "Rozsah a správce",
      "Tyto zásady se vztahují na FameRiser, veřejné informační stránky a soukromý pilot. Identifikační a adresní údaje budoucího provozovatele dosud nejsou doplněny; tato mezera neomezuje možnost obrátit se na současný kontaktní e-mail. Nepovažuj zveřejnění zásad za potvrzení dokončené registrace podnikání. Ostré platby a veřejná registrace nejsou touto aktualizací spuštěny."
    ],
    [
      "Účet a přihlášení",
      "Pro založení a vedení účtu zpracováváme e-mail, identifikátor účtu, údaje o přihlášení a potvrzení věku alespoň 18 let. Právním základem je příprava a plnění smlouvy (čl. 6 odst. 1 písm. b GDPR); pro zabezpečení také oprávněný zájem (písm. f). Nevyžadujeme datum narození ani kopii dokladu pro běžnou registraci. Při přihlášení přes poskytovatele získáváme údaje v rozsahu zobrazeného oprávnění. Heslo k sociální síti FameRiser nedostává. Registrace ani přijetí podmínek nejsou souhlasem s marketingem."
    ],
    [
      "Propojení a veřejný profil",
      "Zpracováváme identifikátor a odkaz sociálního účtu, výsledek a způsob ověření, zadané jméno, fotografii, bio, kategorii, jazyk a zvolenou veřejnou lokalitu. Slouží to k propojení a reklamnímu umístění na tvůj pokyn (plnění smlouvy). Import bio a fotografie není povinný; můžeš dodat vlastní obsah, k němuž máš oprávnění. Ověření konkrétní země řešíme přiměřenými podklady a nepublikujeme je. Připojený účet bez způsobilého umístění zůstává neveřejný. U propojených Facebook stránek ukládáme šifrovaný přístupový token pro pravidelnou kontrolu oprávnění ke správě. Není veřejný; při odpojení, výmazu nebo zjištěné ztrátě přístupu jej odstraníme. Po vypršení je nutné propojení obnovit. Připravovaná metoda ověření není automaticky aktivní na každé sociální síti."
    ],
    [
      "Co uvidí ostatní",
      "U zveřejněného profilu jsou dostupné schválené profilové údaje, sociální odkaz, pořadí, informace o ověření a souhrnná hodnota umístění podle měn, zahrnující platby i přidělené kredity. Rozpis skutečných plateb a promo kreditu není veřejný; vlastník jej vidí ve svém účtu. Veřejné mohou být komentáře, jejich hvězdičky, odpovědi a reakce s údaji, které aplikace zobrazuje o autorovi. Kontaktní e-mail, platební identifikátory, důkazy a jednotlivé platby veřejné nejsou. Veřejný obsah může být indexován a kopírován dalšími osobami; smazání ve FameRiser samo neodstraní jejich samostatné kopie. Do bio a komentářů nevkládej zdravotní, intimní nebo jiné citlivé údaje ani údaje cizích osob bez oprávnění."
    ],
    [
      "Platby a smluvní záznamy",
      "Po spuštění plateb se budou zpracovávat identifikátory objednávek, stav a souhrny plateb, měna, daň, použitý kurz, fakturační země, refundace a přijatá verze podmínek. Základem je plnění smlouvy, případná zákonná povinnost (písm. c) a nezbytná ochrana nároků (písm. f). Číslo karty a její bezpečnostní kód do FameRiser neukládáme. Dodo jako plánovaný prodávající a poskytovatel plateb bude mít vlastní informační povinnosti; jeho konkrétní smluvní údaje se doplní před aktivací."
    ],
    [
      "Nahlášení, žádosti a bezpečnost",
      "Při oznámení, reklamaci, výmazu nebo odvolání zpracováváme kontakt, popis, dotčený obsah, přiměřené důkazy, komunikaci a rozhodnutí. Základem je vyřízení smluvního požadavku, plnění použitelné zákonné povinnosti (například GDPR či DSA) nebo oprávněný zájem na ochraně lidí, služby a nároků. Pro omezení útoků používáme technické údaje o požadavku a záznamy přístupů. Oprávněný zájem posuzujeme vůči zásahu do soukromí; nepoužíváme jej k obejití souhlasu s volitelným měřením. Při námitce přezkoumáme konkrétní okolnosti."
    ],
    [
      "Volitelné měření návštěvnosti",
      "Pouze s tvým souhlasem (čl. 6 odst. 1 písm. a GDPR) měříme otevření stránky žebříčku obsahující profil, viditelnost karty a jména, detail profilu a odchod na sociální síť. Zaznamenáváme druh a čas události, profil, zdroj a technické identifikátory pro omezení duplicit. Server při zpracování požadavku vidí IP adresu; pro aplikační statistiky vytváří denně měněný kryptografický otisk a neukládá sem surovou IP. Otisk není zárukou úplné anonymity. Vlastník profilu dostává souhrnné statistiky, nikoli seznam návštěvníků. Nepoužíváme tyto údaje k reklamnímu cílení napříč weby."
    ],
    [
      "Cookies a odvolání souhlasu",
      "Nezbytné úložiště udržuje přihlášení a tvoji volbu. Podrobnosti a konkrétní názvy jsou v dokumentu Cookies. Volitelné měření odmítneš volbou Jen nezbytné a později změníš přes Nastavení cookies. Odvolání zastaví další volitelné měření a nemá vliv na předchozí zákonné zpracování. Základní používání není podmíněno jeho povolením. Provozní e-maily k účtu, oznámení nebo žádosti nejsou reklamním newsletterem."
    ],
    [
      "Poskytovatelé a místa zpracování",
      "Používáme Sites / OpenAI a Cloudflare pro hostování a ochranu provozu, Supabase pro přihlášení a databázi (projekt v Irsku), VEDOS pro kontaktní poštu a Resend pro provozní e-maily (nastavený odesílací region Irsko). Soukromý pilot může používat přístup přes ChatGPT. Jednotlivé sociální sítě zpracovávají přihlášení a návštěvy svých webů podle vlastních zásad. Kliknutím na externí odkaz opouštíš FameRiser. Samostatně uložené testovací odkazy Instagramu pod přihlášením přes ChatGPT jsou vedeny odděleně od hlavního účtu."
    ],
    [
      "Předávání mimo EHP",
      "Evropský region databáze či odesílání nezaručuje, že veškerá podpora, provozní metadata a subdodavatelé zůstávají v EHP. Před předáním, které vyžaduje záruky podle GDPR, musí být doložen použitelný mechanismus, například platné rozhodnutí o odpovídající ochraně nebo standardní smluvní doložky a posouzení přenosu. U jednotlivých dodavatelů zatím není v projektu doloženo úplné smluvní ověření těchto záruk; veřejné rozšíření zpracování je tím podmíněno. Na žádost poskytneme informace o skutečně použitých zárukách a dostupnou kopii s ochranou cizích důvěrných údajů. Netvrdíme, že pouhým uvedením dodavatele už byla smlouva uzavřena."
    ],
    [
      "Doby uchování",
      "Účet a aktivní profil uchováváme po dobu používání; při výmazu odstraníme nepotřebné údaje při vyřízení žádosti, zpravidla do jednoho měsíce. Podklady, které již nejsou potřeba k ověření, mažeme do 30 dní po uzavření ověřování, zatímco výsledek ověření může trvat s účtem. Pro podrobné události návštěvnosti stanovujeme limit 13 měsíců. Pro běžné aplikační bezpečnostní záznamy stanovujeme 90 dní, pro běžné dotazy podpory 12 měsíců od uzavření. Oznámení a podklady moderace uchováváme po dobu řešení a 12 měsíců po konečném vyřízení, nejméně však do konce lhůty pro přezkum. Potřebné smluvní záznamy, důkaz vyřízení práv a právně relevantní část spisu lze pro ochranu nároků uchovat zpravidla 3 roky od ukončení vztahu či uzavření případu. U probíhajícího sporu uchováme pouze nezbytný rozsah do jeho pravomocného ukončení a vypořádání. Povinné účetní a daňové dokumenty podléhají konkrétním zákonným lhůtám; nevztahujeme tyto lhůty plošně na celé profily."
    ],
    [
      "Jak se lhůty provádějí",
      "Uvedené limity jsou pravidla pro správu údajů, nikoliv tvrzení, že vše maže automat. V pilotu úplný výmaz a kontrolu uchování dokončuje správce. Zálohy a záznamy dodavatelů mají vlastní cykly; jejich skutečné nastavení a smluvní limity musejí být doloženy před rozšířením provozu. Odstraněné údaje se ze zálohy nevracejí do běžného používání; při obnově se znovu provedou evidované výmazy. Pokud konkrétní údaj musí zůstat, odpověď vysvětlí důvod, rozsah a použitelnou dobu."
    ],
    [
      "Tvoje práva a postup",
      "Můžeš požádat o přístup a kopii údajů, opravu, výmaz, omezení, přenositelnost za zákonných podmínek, vznést námitku proti oprávněnému zájmu a odvolat souhlas. Export a žádost o odstranění jsou v Nastavení účtu; bez přístupu napiš na kontaktní e-mail. Přiměřeně ověříme, že jde o správný účet, bez rutinního požadavku na kopii dokladu. Odpovíme bez zbytečného odkladu, zpravidla do jednoho měsíce. Případné zákonné prodloužení nejvýše o další dva měsíce včas vysvětlíme. Žádosti jsou zásadně bezplatné; zákonné výjimky odůvodníme. Stížnost můžeš podat Úřadu pro ochranu osobních údajů (https://uoou.gov.cz/) nebo příslušnému dozorovému úřadu v EU."
    ],
    [
      "Automatizace a aktualizace",
      "Pořadí automaticky vypočítáváme z plateb podle zveřejněných pravidel; nejde o posouzení bonity či osobnosti. O obsahových oznámeních a odvoláních rozhoduje člověk. Nepoužíváme výlučně automatizované rozhodování s právními nebo obdobně závažnými účinky ve smyslu čl. 22 GDPR. Změny zpracování zveřejníme s novou verzí; pokud vyžadují nový souhlas, vyžádáme jej předem."
    ]
  ]
},
cookies: {
  "title": "Cookies a úložiště v prohlížeči",
  "sections": [
    [
      "Tvoje volba",
      "Jen nezbytné a Povolit měření jsou dostupné ve stejné liště. Volitelné měření začne až po povolení. Rozhodnutí změníš tlačítkem Nastavení cookies v aplikaci; odmítnutí nebrání procházení profilů. Veřejné informační stránky samy nespouštějí aplikační měření."
    ],
    [
      "Přihlášení – nezbytné cookies",
      "Supabase používá cookies s názvem začínajícím sb- a identifikátorem projektu, případně rozdělené do více částí, pro přihlášení a obnovu relace. Knihovna nastavuje nejvýše 400 dní; při odhlášení se cookies relace odstraňují, jednotlivé tokeny mohou vypršet dříve. Při zahájeném OAuth přihlášení může vzniknout krátkodobý ověřovací stav. Cookie rankme-social-oauth má při aktivním propojení YouTube platnost nejvýše 10 minut a při dokončení se maže. Při propojování Facebook stránek používáme fameriser-pages-state pro kontrolu návratu z Meta a fameriser-pages-session pro dočasný šifrovaný přístup k výběru stránek. Obě cookies jsou HttpOnly a platí nejvýše 10 minut; stav se při návratu maže. Jde o funkční a bezpečnostní použití, nikoliv marketingové sledování."
    ],
    [
      "Zapamatování rozhodnutí",
      "Cookie rankme_analytics obsahuje yes nebo no a platí nejvýše 365 dní. Hodnota no pouze uchovává odmítnutí. Místní úložiště rankme-consent obsahuje volbu a čas jejího uložení na nejvýše 365 dní; po skončení nebo při nesouladu s cookie se aplikace zeptá znovu. Obsah neobsahuje tvoje jméno. Místní položka theme uchovává světlý, tmavý nebo systémový vzhled, dokud ji nezměníš nebo nesmažeš data prohlížeče. Po smazání dat prohlížeče může být nutné volbu provést znovu."
    ],
    [
      "Volitelné statistiky",
      "Po povolení zaznamenáváme události zobrazení stránky, karty, jména, detailu a odchozí kliknutí. Nepoužíváme reklamní pixely Meta, Google Analytics ani remarketing jako součást tohoto měření. Omezení duplicit používá dočasný identifikátor události a denně měněný serverový otisk návštěvníka. Podrobné aplikační události mají stanovený limit uchování 13 měsíců; nedokazují počet unikátních lidí."
    ],
    [
      "Externí služby a soukromý pilot",
      "Přístupová brána soukromého hostingu, přihlášení sociální sítě a budoucí platební stránka mohou používat vlastní cookies podle svých pravidel. Jejich cookies na jiné doméně FameRiser neřídí. Smluvní a skutečné nastavení hostingu musí být před otevřením veřejného provozu ověřeno. Po odvolání souhlasu nevznikají nové volitelné statistiky; o dříve uložené identifikovatelné údaje můžeš požádat postupem ze zásad soukromí."
    ]
  ]
},
deletion: {
  "title": "Odstranění údajů a odpojení účtu",
  "sections": [
    [
      "Žádost přímo v aplikaci",
      "Přihlas se na https://fameriser.com/dashboard, otevři Nastavení účtu a případně nejprve Export osobních údajů → Exportovat. V části Odstranit účet a osobní údaje zvol Požádat o odstranění, napiš SMAZAT a odešli žádost. Vyčkej na potvrzení; při chybě použij kontaktní e-mail. Uplatnění práv nevyžaduje nákup ani přijetí nových obchodních podmínek."
    ],
    [
      "Co se provede hned a co dokončuje správce",
      "Po úspěšném podání se v jediné databázové transakci zablokují další změny účtu, skryjí profily účtu, odstraní jeho komentáře, odpovědi, reakce, starší hodnocení, uložená propojení a rozpracované stavy propojení a zapíše se žádost. Přihlašovací účet, obrázky, skryté profilové záznamy a veškeré související údaje tím ještě nejsou kompletně vymazány. Správce provede navazující výmaz, zkontroluje samostatná úložiště a posoudí pouze nezbytné výjimky pro zákonné uchování a ochranu nároků."
    ],
    [
      "Bez přístupu do FameRiser",
      "Na kontaktní e-mail pošli předmět FameRiser – odstranění údajů. Uveď e-mail používaný v aplikaci, případně odkaz či jméno profilu, a zda žádáš výmaz celého účtu nebo konkrétního propojení. Piš pokud možno ze související adresy. Neznáš-li identifikátor, pomůžeme jej dohledat. Neposílej hesla, přístupové tokeny ani přihlašovací kódy. Kopii dokladu neposílej bez konkrétního odůvodněného požadavku. Omezený přístup k pilotu nebrání podání e-mailem."
    ],
    [
      "Odpojení Facebooku a dalších sítí",
      "V nastavení příslušné sítě můžeš odebrat přístup aplikace FameRiser. U Facebooku hledej Aplikace a weby v nastavení; aktuální nápověda je https://www.facebook.com/help/100754513412802. Odebrání oprávnění samo nezaručuje smazání již uložených údajů ve FameRiser. Nejprve si zajisti alternativní přístup nebo odešli žádost o výmaz. Tento postup nemaže účet na samotné sociální síti."
    ],
    [
      "Odděleně uložené odkazy Instagramu",
      "Pokud jsi použil testovací /instagram pod přihlášením přes ChatGPT, odeber odkazy tam nebo je výslovně uveď v žádosti. Tyto záznamy jsou v odděleném úložišti a běžné smazání účtu přihlášeného přes sociální síť je automaticky nezahrnuje."
    ],
    [
      "Lhůty, výjimky a potvrzení",
      "Žádost vyřídíme bez zbytečného odkladu, zpravidla do jednoho měsíce; případné zákonné prodloužení včas odůvodníme. Potvrzení přijetí není potvrzením úplného výmazu. O dokončení a případných ponechaných údajích tě informujeme s důvodem a dobou uchování. Neodstraňujeme doklady, které musíme uchovat, ani nezbytné podklady otevřeného sporu. Pro ně omezíme použití na příslušný účel. Pravidla záloh a lhůty jsou popsány v zásadách soukromí."
    ],
    [
      "Souvislost s platbou a veřejnými kopiemi",
      "Výmaz automaticky nezakládá refundaci a případná refundace se řídí samostatnými pravidly; své zákonné nároky můžeš uplatnit i při ukončení účtu. Zrušení zveřejnění znamená, že profil přestane být nabízen v žebříčku. Samostatné kopie na sociálních sítích, u vyhledávačů nebo třetích osob mohou vyžadovat žádost příslušnému poskytovateli."
    ]
  ]
},
promo: {
  "title": "Pravidla startovní promo akce",
  "sections": [
    [
      "Spuštění a kapacita",
      "Startovní nabídka zahrnuje nejvýše 1 000 míst celkem napříč zapojenými sítěmi: Instagram, Facebook, TikTok, YouTube, Twitch a X. Kapacita je společná. Zařazení sítě neznamená, že už je aktivní její ověřování. Při spuštěné akci získá způsobilý profil volné místo automaticky po dokončení přidání a souhlasu se zveřejněním, do vyčerpání kapacity nebo zveřejněného ukončení nabídky."
    ],
    [
      "Kdo a kdy získá místo",
      "Místo je určeno uživateli od 18 let s potvrzeným e-mailem, platně ověřeným sociálním profilem a přijatými pravidly. Každý uživatelský účet FameRiser může získat pouze jeden promo kredit 5 USD celkem, napříč všemi způsobilými sociálními profily. Facebook stránky promo kredit nezískávají; zveřejnění stránky vyžaduje výslovné potvrzení jejího správce a úspěšnou platbu od 5 USD. Další ověřený profil může zařadit platbou od 5 USD bez dalšího bonusu. Každý konkrétní sociální účet může získat promo místo pouze jednou, i když je později odpojen nebo připojen k jinému účtu FameRiser. Samotné přihlášení e-mailem, Googlem nebo Applem neověřuje libovolný sociální profil. U podporovaného sociálního přihlášení ověřujeme konkrétní účet podle identifikátoru a údajů přímo od poskytovatele. Přihlášení přes podporovanou sociální síť automaticky vytvoří ověřený profil z údajů poskytovatele a bez dalšího profilového formuláře přidělí volné promo místo. Základní potvrzení věku a podmínek účtu je součástí první registrace. Jméno, profilová fotografie a odkaz se zobrazí veřejně, e-mail zůstane neveřejný. Bio a další údaje lze doplnit později. Přihlášení e-mailem ani pouhé vložení odkazu automatické místo nevytváří. Po přidělení rozhoduje při stejném promo skóre čas první registrace ve FameRiseru; další profily téhož účtu rozlišuje čas jejich vytvoření a stálý identifikátor. Pro ověření nebo vstup se nevyžaduje nákup. Vytváření více účtů za účelem obcházení limitu je zakázané."
    ],
    [
      "Funkce a pořadí",
      "Promo profil má stejné funkce, možnosti profilu a statistiky jako platící profil. Každý způsobilý profil získá jednorázový nepeněžní promo kredit 5 USD na reklamní umístění; skutečně uhrazená částka zůstává 0. Kredit má pro celou startovní akci stejný přepočet: kurz ECB z 21. 9. 2026, 1 EUR = 1,1490 USD, tedy 4,351610 RankScore. Fixní přepočet brání tomu, aby se stejné bonusy lišily podle dne přidělení. Veřejná „Hodnota umístění“ sčítá platby a přidělený kredit, aniž by označovala konkrétní profil jako promo. Nejde o tvrzení, že byla celá hodnota zaplacena. Rozpis kreditu a skutečně uhrazených částek vidí vlastník v soukromém účtu. Kredit a skóre dobrovolných plateb se sčítají; profil s vyšším celkovým skóre předběhne nižší skóre. V časových žebříčcích se kredit započítává po 24 hodin, 7 dní či 30 dní od jeho přidělení; v celkovém žebříčku zůstává. Při shodném promo skóre rozhoduje první registrace ve FameRiseru. Již přidělená promo místa získávají stejný bonus bez dalšího čerpání kapacity. Držitel promo místa může dobrovolně zaplatit za zvýšení vlastního skóre; žádná platba není povinná a nic se automaticky nestrhává."
    ],
    [
      "Trvání a zrušení",
      "Přidělené místo nemá samostatné předem stanovené datum vypršení a podléhá stejným podmínkám dostupnosti, ověření a moderace jako placený profil. Nejde o peněžní výhru, nelze je převést nebo vyplatit. Zrušené místo se automaticky nevrací do nabídky; kapacita počítá přidělení. Ukončení nabídky nových míst samo neruší již řádně přidělená místa."
    ],
    [
      "Transparentnost",
      "Jde o startovní reklamní nabídku, nikoliv losování nebo soutěž o peněžní cenu. Aktuální dostupnost zobrazuje aplikace při spuštěné akci. Oprávněnou chybu nebo spor o přidělení lze oznámit podpoře; technickou chybu napravíme podle záznamů, nikoliv podle výše následné platby."
    ]
  ]
},
contact:{title:'Kontaktní místa a podpora',sections:[
 ['Pro uživatele','Elektronické kontaktní místo podle DSA a podpora: info@fameriser.com. Komunikujeme česky a anglicky. Nahlášení obsahu podávej přes /report, ostatní žádosti přes /requests. Kontakt není omezen na automatický formulář.'],
 ['Pro orgány a instituce','Elektronické kontaktní místo pro orgány členských států, Evropskou komisi a Evropský sbor pro digitální služby: info@fameriser.com, předmět DSA – úřední komunikace. Jazyky čeština a angličtina. Pro právní korespondenci se použije adresa provozovatele doplněná před spuštěním.']
 ]}
} as const;
export type PolicyKind = keyof typeof policies;
export function policySnapshot() {return {version:POLICY_VERSION,documents:policies,publicPrivacy};}
