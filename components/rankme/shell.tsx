"use client";
import { LEGAL_URLS } from "@/lib/rankme/legal";
import { CONSENT_SECONDS, currentConsent } from "@/lib/rankme/cookie-consent";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Menu,
  MoveUpRight,
  Plus,
  Sun,
  Moon,
  Monitor,
  Check,
  Settings2,
} from "lucide-react";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from "@/components/ui/dropdown-menu";
import { APP } from "@/lib/rankme/config";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" storageKey="fameriser-signature-theme" enableSystem>
      <>
        {children}
        <CookieConsent />
        <Toaster richColors position="bottom-right" />
      </>
    </ThemeProvider>
  );
}
export function ThemeControl() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const currentTheme = mounted ? theme || "system" : "system";
  const next = currentTheme === "light" ? "dark" : currentTheme === "dark" ? "system" : "light";
  const themeNames: Record<string,string> = {light:"světlý",dark:"tmavý",system:"podle zařízení"};
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Vzhled: ${themeNames[currentTheme]}. Přepnout na ${themeNames[next]}.`}
      title={`Vzhled: ${themeNames[currentTheme]}`}
      onClick={() => setTheme(next)}
    >
      {mounted && theme === "dark" ? (
        <Moon size={17} />
      ) : mounted && theme === "light" ? (
        <Sun size={17} />
      ) : (
        <Monitor size={17} />
      )}
    </Button>
  );
}
export function Header({
  name = APP.name,
  active = "",
}: {
  name?: string;
  active?: string;
}) {
  return (
    <header className="site-header">
      <a className="brand" href="/">
        <img className="brand-logo" src="/brand/fameriser-fr-icon.png" width={44} height={44} alt="" />
        {name}
      </a>
      <nav className="desktop-navigation" aria-label="Hlavní navigace">
        {[
          ["Žebříčky", "/"],
          ["Jak to funguje", "/how-it-works"],
          ["Statistiky", "/stats"],
          ["Propojené účty", "/connections"],
          ["FAQ", "/faq"],
        ].map(([label, url]) => (
          <a key={url} href={url} className={active === url ? "active" : ""}>
            {label}
          </a>
        ))}
      </nav>
      <div className="header-actions">
        <Button variant="ghost" className="login-button" asChild>
          <a href="/dashboard">Můj účet</a>
        </Button>
        <Button className="primary-button header-add-profile" asChild>
          <a href="/join">
            <Plus size={16} /> Přidat profil
          </a>
        </Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button className="mobile-navigation-toggle" variant="ghost" size="icon" aria-label="Otevřít hlavní nabídku"><Menu size={21}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="mobile-navigation-menu">
          {[["Žebříčky","/"],["Přidat profil","/join"],["Propojené účty","/connections"],["Jak to funguje","/how-it-works"],["Statistiky","/stats"],["FAQ","/faq"]].map(([label,url])=><DropdownMenuItem key={url} asChild><a href={url} aria-current={active===url?'page':undefined}>{label}</a></DropdownMenuItem>)}
        </DropdownMenuContent></DropdownMenu>
      </div>
    </header>
  );
}
export function Footer({ name = APP.name }: { name?: string }) {
  return (
    <footer className="site-footer">
      <a className="brand" href="/">
        <img className="brand-logo" src="/brand/fameriser-fr-icon.png" width={40} height={40} alt="" />
        {name}
      </a>
      <p>{APP.tagline}</p>
      <div>
        <a href="/terms">Podmínky</a>
        <a href={LEGAL_URLS.privacy}>Soukromí</a>
        <a href={LEGAL_URLS.deletion}>Odstranění údajů</a>
        <a href="/cookies">Cookies</a>
        <a href="/contact">Kontakt</a>
        <a href="/report">Nahlásit obsah</a>
        <a href="/requests">Odstoupení a žádosti</a>
        <a href="/policies/ranking">Pravidla pořadí</a>
        <a href="/policies/refunds">Vrácení plateb</a>
        <a href="/promo">Pravidla promo akce</a>
        <a href="https://dodopayments.com/buyer-terms" target="_blank" rel="noreferrer">Dodo Buyer Terms</a>
        <a href="/admin">Administrace</a>
      </div>
      <ThemeControl />
    </footer>
  );
}
export function PageShell({
  children,
  title,
  eyebrow,
  description,
  name = APP.name,
  wide = false,
}: {
  children: React.ReactNode;
  title: string;
  eyebrow?: string;
  description?: string;
  name?: string;
  wide?: boolean;
}) {
  return (
    <>
      <Header name={name} />
      <main className={`inner-page ${wide ? "wide-page" : ""}`}>
        <a href="/" className="back-link">
          <ArrowLeft size={15} /> Zpět na žebříček
        </a>
        <div className="page-intro">
          {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {children}
        <Footer name={name} />
      </main>
    </>
  );
}
export function DemoNote() {
  return (
    <div className="notice demo-notice">
      <span className="mini-label">DEMO</span>
      <p>
        Žebříček obsahuje fiktivní profily. Platby a hodnocení jsou vypnuté.
        Svůj Instagram už můžeš soukromě uložit v části{" "}
        <a href="/connections">Propojené účty</a>.
      </p>
    </div>
  );
}
function CookieConsent() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (location.pathname.startsWith('/private')) return;
    let current = false;
    try {
      let raw = localStorage.getItem("rankme-consent");
      // Keep an existing refusal; a policy update must not pressure users to opt in.
      if (raw === 'necessary' && document.cookie.split(';').some(c => c.trim() === 'rankme_analytics=no')) {
        raw = JSON.stringify({choice:'necessary',savedAt:Date.now()});
        localStorage.setItem('rankme-consent',raw);
      }
      current = currentConsent(raw, document.cookie);
    } catch { /* Storage may be disabled. */ }
    if (!current) {
      document.cookie = `rankme_analytics=no; Path=/; Max-Age=0; SameSite=Lax`;
      window.dispatchEvent(new Event("rankme:consent-changed"));
    }
    queueMicrotask(() => setOpen(!current));
    const show = () => setOpen(true);
    window.addEventListener("rankme:privacy", show);
    return () => window.removeEventListener("rankme:privacy", show);
  }, []);
  const save = (yes: boolean) => {
    try { localStorage.setItem("rankme-consent", JSON.stringify({choice:yes ? "analytics" : "necessary", savedAt:Date.now()})); } catch { /* Cookie still controls this visit. */ }
    document.cookie = `rankme_analytics=${yes ? "yes" : "no"}; Path=/; Max-Age=${CONSENT_SECONDS}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    window.dispatchEvent(new Event("rankme:consent-changed"));
    setOpen(false);
  };
  if (!open || (typeof window !== 'undefined' && location.pathname.startsWith('/private'))) return null;
  return (
    <aside className="cookie-notice" aria-label="Nastavení soukromí">
      <div>
        <Settings2 size={18} />
        <strong>Tvoje soukromí má své místo.</strong>
      </div>
      <p>
        Nezbytné cookies udržují přihlášení. Volitelně nám dovol měřit zobrazení
        a kliknutí na profily. <a href="/cookies">Podrobnosti</a>
      </p>
      <section>
        <Button variant="outline" onClick={() => save(false)}>
          Jen nezbytné
        </Button>
        <Button onClick={() => save(true)}>Povolit měření</Button>
      </section>
    </aside>
  );
}
