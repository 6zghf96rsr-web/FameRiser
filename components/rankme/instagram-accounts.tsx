"use client";

import { useEffect, useState } from "react";
import { Camera as Instagram, LockKeyhole, Plus, ExternalLink, LoaderCircle, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { DMVerificationInfo } from "./dm-verification-info";
import { instagramURL, type SavedInstagram } from "@/lib/rankme/instagram";

async function request(body?: object) {
  const response = await fetch("/api/instagram", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const savedAccount = z.object({ id: z.string(), username: z.string(), social_url: z.string(), created_at: z.number() });
  const data = z.object({ error: z.string().optional(), accounts: z.array(savedAccount).optional(), account: savedAccount.optional() }).parse(await response.json());
  if (!response.ok) throw new Error(data.error || "Požadavek se nezdařil.");
  return data;
}

export function InstagramAccounts({ demo }: { demo: boolean }) {
  const [accounts, setAccounts] = useState<SavedInstagram[]>([]);
  const [value, setValue] = useState("");
  const [owns, setOwns] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SavedInstagram | null>(null);
  const [remove, setRemove] = useState<SavedInstagram | null>(null);

  const refresh = async () => {
    setLoadError("");
    try {
      const data = await request();
      if (!data.accounts) throw new Error("Účty se nepodařilo načíst.");
      setAccounts(data.accounts); setLoaded(true);
    }
    catch (e) { setLoadError((e as Error).message); }
  };
  useEffect(() => { void refresh(); }, []);

  return (
    <div className="connections-page">
      <DMVerificationInfo />
      <div className="connection-notice" role="status">
        <LockKeyhole />
        <div><strong>Připrav si Instagram k bezplatnému propojení.</strong>
          <p>Odkaz si uložíš jako soukromý návrh. Nepotvrzuje tvou identitu a účet tím ještě nepřipojíš. Připojení se dokončí až po ověření; pro zveřejnění bude potřeba také platba nebo získané promo místo.</p>
        </div>
      </div>
      <div className="connections-layout">
        <section className="form-card connection-form">
          <div className="connection-section-title"><Instagram /><h2>Připravit Instagram</h2></div>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true); setError("");
            void (async () => {
              try {
                instagramURL(value);
                const data = await request({ action: "add", account: value, ownership: owns });
                const saved = data.account;
                if (!saved) throw new Error("Uložení se nepodařilo potvrdit. Zkus to znovu.");
                setAccounts((current) => [saved, ...current.filter((a) => a.id !== saved.id)]);
                setValue(""); setOwns(false);
                toast.success("Soukromý návrh je uložený. Instagram zatím není propojený.");
              } catch (e) { setError((e as Error).message); }
              finally { setBusy(false); }
            })();
          }}>
            <label htmlFor="instagram-account">Uživatelské jméno nebo odkaz</label>
            <Input id="instagram-account" name="instagram-account" value={value} onChange={(event) => setValue(event.target.value)}
              placeholder="@tvuj.ucet nebo instagram.com/tvuj.ucet" required maxLength={500} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="instagram-account-help" disabled={busy} />
            <p id="instagram-account-help" className="subtle-note">Vlož profil, ne příspěvek nebo reel. Heslo k Instagramu nepotřebujeme.</p>
            <label className="check-line"><Checkbox checked={owns} onCheckedChange={(checked) => setOwns(checked === true)} disabled={busy} /><span>Tento účet vlastním nebo mám oprávnění jej spravovat.</span></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <Button className="primary-button full-width" disabled={busy || !owns || !value.trim() || !loaded}>
              {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} Uložit soukromý návrh
            </Button>
          </form>
          <div className="connection-challenge">
            <strong>Nejdříve ověření, potom platba a zveřejnění.</strong>
            <p className="subtle-note">Pro místo v žebříčku musíš prokázat přístup k danému sociálnímu účtu. Uložení odkazu ani zaškrtnutí oprávnění vlastnictví neověřuje. Pořadí ověřených profilů určuje zaplacená částka.</p>
            <p className="subtle-note">Ověřování Instagramu zatím není aktivní. Účet si můžeš uložit a připravit jeho náhled; před dokončeným ověřením se nezveřejní.</p>
            {demo && <p className="subtle-note">Platební formulář je pouze ukázka. Žádná částka se nestrhne.</p>}
          </div>
        </section>
        <section className="connection-list-section">
          <div className="connection-section-title"><h2>Rozpracovaná propojení</h2>{loaded && <span className="count-pill">{accounts.length}/10</span>}</div>
          {loadError ? <div className="form-error" role="alert"><p>{loadError}</p><Button variant="outline" onClick={() => void refresh()}>Zkusit načíst znovu</Button></div>
            : !loaded && <p className="subtle-note" role="status">Načítání uložených účtů…</p>}
          {loaded && !accounts.length && <div className="empty-state connection-empty"><Instagram /><h3>Zatím nemáš rozpracované propojení.</h3><p>Ulož si odkaz na svůj účet jako soukromý návrh.</p></div>}
          {accounts.map((account) => <article className="connection-card" key={account.id}>
            <div className="connection-card-head"><div><span className="eyebrow">INSTAGRAM</span><h3>@{account.username}</h3></div><span className="connection-badge">Návrh · Nepřipojeno</span></div>
            <p className="connection-visibility"><LockKeyhole size={14} /> Soukromé · Mimo žebříček</p>
            <p className="subtle-note">{account.social_url}</p>
            <div className="connection-card-actions">
              <Button variant="ghost" disabled={busy} onClick={() => setRemove(account)}><Trash2 size={14} /> Odebrat</Button>
              <Button variant="outline" onClick={() => setPreview(account)}>Náhled účtu <ExternalLink size={14} /></Button>
            </div>
            <Button className="full-width" disabled>Ověření zatím není dostupné</Button>
            <Button variant="outline" className="full-width" asChild>
              <a href={`/join?instagram=${account.id}`}>
                Připravit náhled profilu
              </a>
            </Button>
          </article>)}
        </section>
      </div>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Instagram @{preview?.username}</DialogTitle><DialogDescription>Soukromý náhled návrhu. Účet zatím není propojený a nikde veřejně nevystupuje.</DialogDescription></DialogHeader>
          <p className="subtle-note">Fotky, bio a počet sledujících se z Instagramu zatím nenačítají.</p>
          {preview && <Button className="primary-button" asChild><a href={preview.social_url} target="_blank" rel="noopener noreferrer">Otevřít na Instagramu <ExternalLink size={16} /></a></Button>}
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(remove)} onOpenChange={(open) => { if (!open) setRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Odebrat @{remove?.username}?</AlertDialogTitle><AlertDialogDescription>Smaže se uložený odkaz z FameRiser. Tvůj účet na Instagramu zůstane zachovaný.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Zrušit</AlertDialogCancel><AlertDialogAction onClick={() => {
            if (!remove || busy) return;
            const id = remove.id; setBusy(true); setError("");
            void request({ action: "remove", id }).then(() => {
              setAccounts((current) => current.filter((account) => account.id !== id));
              toast.success("Uložený Instagram byl odebrán.");
            }).catch((e) => setError(e.message)).finally(() => setBusy(false));
          }}>Odebrat odkaz</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
