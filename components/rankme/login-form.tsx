"use client";
import { LEGAL_URLS } from "@/lib/rankme/legal";
import { useEffect, useState } from "react";
import { ArrowRight, Mail, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { browserDB } from "@/lib/supabase/client";
import { api } from "./join-form";
import { DemoNote } from "./shell";
import type { AuthStatus } from "@/lib/rankme/auth-status";
import { authReturnPath } from "@/lib/rankme/connections";
import { canonicalLoginUrl } from "@/lib/rankme/auth-navigation";
import { loginProviders, loginProviderNames, type LoginProvider } from "@/lib/rankme/login-providers";
export function LoginForm({
  demo,
  config,
  status,
  appUrl,
}: {
  demo: boolean;
  config: { url: string; key: string };
  status: AuthStatus;
  appUrl?: string;
}) {
  const [mode, setMode] = useState("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [terms, setTerms] = useState(false),
    [adult,setAdult]=useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [originReady, setOriginReady] = useState(false);
  const [emailOpen,setEmailOpen]=useState(false),[resetting,setResetting]=useState(false);
  const activeProviders=loginProviders.filter(provider=>status.ready&&status[provider]);
  useEffect(() => {
    const canonical = canonicalLoginUrl(location.href, appUrl);
    if (canonical) { location.replace(canonical); return; }
    setOriginReady(true);
    const reset=new URLSearchParams(location.search).get("reset")==="1";
    setResetting(reset);setEmailOpen(reset);
    const loginError = new URLSearchParams(location.search).get("error");
    if (loginError)
      setError(
        loginError === "session"
          ? "Pro pokračování se prosím znovu přihlas. Potom můžeš potvrdit podmínky účtu."
          : "Přihlášení se nepodařilo dokončit nebo bylo zrušené. Zkus to znovu.",
      );
  }, [appUrl]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (demo) {
      setError(
        "Registrace a přihlášení budou dostupné po připojení Supabase. V demu nevzniká skutečný účet.",
      );
      return;
    }
    setBusy(true);
    try {
      if (new URLSearchParams(location.search).get("reset") === "1") {
        const db = browserDB(config);
        if (!db) throw new Error("Přihlášení není připojené.");
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Heslo bylo změněno. Můžeš pokračovat do svého účtu.");
        return;
      }
      const r = await api("auth", { action: mode, email, password, terms, adult });
      if (r.message) setMessage(r.message);
      else
        location.href = r.acceptance_required ? "/account-consent?next="+encodeURIComponent(authReturnPath(new URLSearchParams(location.search).get("next"))) : authReturnPath(
          new URLSearchParams(location.search).get("next"),
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const oauth = async (provider: LoginProvider) => {
    setError("");
    if (demo) {
      setError(
        "Přihlášení přes " +
          loginProviderNames[provider] +
          " není v demu aktivní.",
      );
      return;
    }
    if (!status[provider]) {
      setError("Tento způsob přihlášení zatím není aktivní.");
      return;
    }
    const db = browserDB(config);
    if (!db) {
      setError("Přihlášení není připojené.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await db.auth.signInWithOAuth({
        provider,
        options: {
          scopes: provider === 'facebook' ? 'email,public_profile,user_link' : undefined,
          redirectTo:
            location.origin +
            "/auth/callback?profile_provider=" + provider + "&next=" +
            encodeURIComponent(
              authReturnPath(new URLSearchParams(location.search).get("next")),
            ),
        },
      });
      if (error) setError(error.message);
    } catch {
      setError("Přihlášení se nepodařilo zahájit. Zkus to znovu.");
    } finally {
      setBusy(false);
    }
  };
  if (!originReady) return <div className="form-card login-card" role="status">Připravuji bezpečné přihlášení…</div>;
  return (
    <div className="form-card login-card">
      {demo && <DemoNote />}
      {error&&<div className="form-error" role="alert">{error}</div>}
      {message&&<div className="form-success" role="status">{message}{resetting&&<p><a href="/dashboard">Pokračovat do účtu →</a></p>}</div>}
      {resetting?<h2>Nastavit nové heslo</h2>:<>
        <h2>Pokračuj svým účtem</h2>
        <div className="oauth-buttons">{activeProviders.map((provider,index)=><Button key={provider} className={index===0?'primary-button full-width':'full-width'} variant={index===0?'default':'outline'} disabled={busy} onClick={()=>void oauth(provider)}>Pokračovat přes {loginProviderNames[provider]}</Button>)}</div>
        {activeProviders.length>0&&<p className="subtle-note">Stejné tlačítko slouží k přihlášení i vytvoření účtu. Heslo zadáváš jen na stránce poskytovatele.</p>}
        {status.facebook&&<p className="login-disclosure">Přes Facebook ověříme a vytvoříme tvůj profil. Pokud splníš pravidla aktivní promo akce, může se jméno, fotografie a odkaz zveřejnit v žebříčku zdarma. E-mail zůstává soukromý. <a href="/policies/promo">Pravidla promo akce</a></p>}
        {status.unavailable&&<p className="subtle-note" role="status">Sociální přihlášení se nepodařilo načíst. Můžeš použít e-mail nebo obnovit stránku.</p>}
        {activeProviders.length>0&&<Button className="email-login-toggle" variant="outline" aria-expanded={emailOpen} aria-controls="email-login-form" onClick={()=>setEmailOpen(!emailOpen)}><Mail size={16}/>{emailOpen?'Skrýt přihlášení e-mailem':'Pokračovat e-mailem'}</Button>}
      </>}
      {(resetting||emailOpen||!activeProviders.length)&&<div id="email-login-form">
      {!resetting&&<Tabs value={mode} onValueChange={v=>{setMode(v);setError('');setMessage('');}}><TabsList className="login-tabs"><TabsTrigger value="login">Přihlášení e-mailem</TabsTrigger><TabsTrigger value="register">Nový účet</TabsTrigger></TabsList></Tabs>}
      <form onSubmit={submit}>
        {!resetting&&<label>
          E-mail
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ty@example.com"
          />
        </label>}
        <label>
          Heslo
          <Input
            type="password"
            autoComplete={
              resetting || mode === "register" ? "new-password" : "current-password"
            }
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Alespoň 8 znaků"
          />
        </label>
        {!resetting && mode === "register" && <label className="check-line"><Checkbox checked={adult} onCheckedChange={v=>setAdult(v===true)}/>Je mi alespoň 18 let.</label>}
        {!resetting && mode === "register" && (
          <label className="check-line">
            <Checkbox
              checked={terms}
              onCheckedChange={(v) => setTerms(v === true)}
            />
            <span>
              Souhlasím s <a href="/terms">podmínkami</a> a seznámil/a jsem se
              se <a href={LEGAL_URLS.privacy}>zásadami soukromí</a>.
            </span>
          </label>
        )}
        <Button
          type="submit"
          className="primary-button full-width"
          disabled={busy || !status.ready}
        >
          {busy ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <ArrowRight size={16} />
          )}{" "}
          {resetting ? "Uložit nové heslo" : mode === "login" ? "Přihlásit se" : "Vytvořit účet"}
        </Button>
      </form>
      {!resetting&&<Button
        variant="link"
        className="reset-button"
        onClick={async () => {
          try {
            if (demo) throw new Error("Obnova hesla není v demu aktivní.");
            const r = await api("auth", { action: "reset", email });
            setMessage(r.message);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Zapomenuté heslo?
      </Button>}
      </div>}
      <p className="subtle-note">
        Jeden účet pro všechny tvoje sociální profily.
      </p>
    </div>
  );
}
