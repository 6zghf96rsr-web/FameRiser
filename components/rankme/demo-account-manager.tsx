"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Database, Users, ShieldCheck, Ban, Plus, Pencil, Trash2, Search, Download, LoaderCircle, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { demoRoles, demoStatuses, demoActions, type DemoAccounts, type DemoAccountInput, type DemoUser } from "@/lib/rankme/demo-accounts";

async function requestAccounts(input?: DemoAccountInput): Promise<DemoAccounts> {
  const response = await fetch("/api/demo/accounts", {
    method: input ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    ...(input ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : {}),
  });
  const result = await response.json() as DemoAccounts & { error?: string };
  if (!response.ok) throw new Error(result.error || "Účty se nepodařilo načíst.");
  return result;
}

function useDemoAccounts() {
  const [data, setData] = useState<DemoAccounts | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try { setData(await requestAccounts()); }
    catch (e) { setError(e instanceof Error ? e.message : "Účty se nepodařilo načíst."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const mutate = async (input: DemoAccountInput) => {
    setBusy(true); setError("");
    try {
      setData(await requestAccounts(input));
      toast.success("Uloženo do databáze.");
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Změnu se nepodařilo uložit.";
      setError(message); toast.error(message);
      return false;
    } finally { setBusy(false); }
  };
  return { data, error, busy, refresh, mutate };
}

function AccountLoading({ busy, error, retry }: { busy: boolean; error: string; retry: () => void }) {
  return <section className="form-card" aria-live="polite">
    {busy ? <p className="demo-inline"><LoaderCircle className="animate-spin" size={18} /> Načítám účty…</p> : <>
      <p className="form-error" role="alert">{error || "Účty zatím nejsou načtené."}</p>
      <Button onClick={retry}>Zkusit znovu</Button>
    </>}
  </section>;
}

const date = (timestamp: number) => new Date(timestamp).toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short" });

export function DemoAccountManager() {
  const { data, error, busy, refresh, mutate } = useDemoAccounts();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<DemoUser | "new" | null>(null);
  const [deleting, setDeleting] = useState<DemoUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DemoUser["role"]>("user");
  if (!data) return <AccountLoading busy={busy} error={error} retry={refresh} />;
  const testUsers = data.users.filter((u) => u.kind === "test");
  const filtered = data.users.filter((u) => (filter === "all" || u.status === filter)
    && `${u.display_name} ${u.email}`.toLocaleLowerCase("cs").includes(query.toLocaleLowerCase("cs")));
  const edit = (user: DemoUser | "new") => {
    setEditing(user);
    setName(user === "new" ? "" : user.display_name);
    setEmail(user === "new" ? "" : user.email);
    setRole(user === "new" ? "user" : user.role);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || busy) return;
    const details = { display_name: name, email, role };
    const ok = await mutate(editing === "new" ? { action: "create", ...details } : { action: "update", id: editing.id, ...details });
    if (ok) setEditing(null);
  };
  const exportData = async () => {
    try {
      const snapshot = await requestAccounts();
      const blob = new Blob([JSON.stringify({ format: "rankme-demo-accounts-v1", exported_at: new Date().toISOString(), ...snapshot }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "fameriser-demo-ucty.json";
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export se nepodařil."); }
  };
  return <section className="demo-manager" aria-label="Správa testovacích uživatelů">
    <div className="demo-toolbar">
      <div><h2>Uživatelské účty</h2><p className="demo-muted">Tvoje soukromé demo · {testUsers.length} / {data.limit} testovacích účtů</p></div>
      <div className="demo-inline">
        <Button variant="outline" onClick={exportData} disabled={busy}><Download size={15} /> Export účtů</Button>
        <Button className="primary-button" onClick={() => edit("new")} disabled={busy || testUsers.length >= data.limit}><Plus size={16} /> Nový uživatel</Button>
      </div>
    </div>
    <p className="notice"><Database size={18} /> Údaje, role a stav účtů se ukládají. Testovací uživatelé mají e-mail s koncovkou .test, nedostávají zprávy a nemohou se přihlásit. Jejich role slouží k ladění administrace.</p>
    <div className="metric-grid admin-metrics">
      <div><Users /><span>Testovací účty</span><strong>{testUsers.length}</strong></div>
      <div><ShieldCheck /><span>Aktivní testovací účty</span><strong>{testUsers.filter((u) => u.status === "active").length}</strong></div>
      <div><Ban /><span>Blokované testovací účty</span><strong>{testUsers.filter((u) => u.status === "blocked").length}</strong></div>
      <div><Database /><span>Ukládání</span><strong className="demo-metric-label">Databáze</strong></div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-filters">
      <div className="search-field"><Search size={16} /><Input aria-label="Hledat uživatele" placeholder="Hledat jméno nebo e-mail…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Stav účtu"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="all">Všechny stavy</SelectItem><SelectItem value="active">Aktivní</SelectItem><SelectItem value="blocked">Blokované</SelectItem>
      </SelectContent></Select>
    </div>
    <div className="demo-user-list" aria-busy={busy}>
      {filtered.length === 0 && <p className="demo-empty">Žádný účet neodpovídá hledání.</p>}
      {filtered.map((user) => <article key={user.id} className="demo-user-row">
        <div className="demo-user-avatar" aria-hidden="true">{user.display_name.slice(0, 1).toUpperCase()}</div>
        <div className="demo-user-identity"><strong>{user.display_name}</strong><span>{user.email}</span><small>{user.kind === "owner" ? "Tvůj přístup do dema" : `Vytvořeno ${date(user.created_at)}`}</small></div>
        <div className="demo-user-badges"><span className="status-pill">{user.kind === "owner" ? "Vlastník dema" : demoRoles[user.role]}</span><span className={`status-pill ${user.status === "blocked" ? "banned" : "active"}`}>{demoStatuses[user.status]}</span></div>
        <div className="demo-user-actions">
          {user.kind === "owner" ? <Button variant="outline" asChild><a href="/dashboard">Můj účet</a></Button> : <>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => edit(user)} aria-label={`Upravit ${user.display_name}`}><Pencil size={14} /> Upravit</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void mutate({ action: "status", id: user.id, status: user.status === "active" ? "blocked" : "active" })}>{user.status === "active" ? "Blokovat" : "Odblokovat"}</Button>
            <Button variant="ghost" size="icon" disabled={busy} onClick={() => setDeleting(user)} aria-label={`Smazat ${user.display_name}`}><Trash2 size={16} /></Button>
          </>}
        </div>
      </article>)}
    </div>
    {testUsers.length === 0 && !query && <div className="demo-empty"><h3>První testovací uživatel</h3><p>Vytvoř například Janu s adresou jana@fameriser.test a vyzkoušej změnu role nebo blokaci.</p><Button variant="outline" onClick={() => edit("new")}>Vytvořit testovací účet</Button></div>}
    <details className="demo-audit"><summary>Historie změn · posledních {data.events.length} záznamů</summary>
      <p className="demo-muted">Zobrazujeme a exportujeme nejvýše 50 posledních změn účtů. Starší zůstávají v databázi.</p>
      {data.events.length === 0 ? <p>Zatím nebyla provedena žádná změna.</p> : <ul>{data.events.map((event) => <li key={event.id}>
        <div><strong>{demoActions[event.action]}</strong><span>{data.users.find((u) => u.id === event.target_id)?.display_name || "Smazaný testovací účet"}</span></div>
        <time dateTime={new Date(event.created_at).toISOString()}>{date(event.created_at)}</time>
      </li>)}</ul>}
    </details>
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}>
      <DialogContent><DialogTitle>{editing === "new" ? "Nový testovací uživatel" : "Upravit uživatele"}</DialogTitle><DialogDescription>Účet zůstane pouze v tvém demu. E-mail slouží jako testovací údaj.</DialogDescription>
        <form className="demo-user-form" onSubmit={submit}>
          <label htmlFor="demo-user-name">Jméno<Input id="demo-user-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required autoComplete="off" disabled={busy} /></label>
          <label htmlFor="demo-user-email">Testovací e-mail<Input id="demo-user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jana@fameriser.test" maxLength={254} required autoComplete="off" disabled={busy} /><small>Adresa musí končit na .test. Nic na ni neposíláme.</small></label>
          <div><label id="demo-role-label">Role v demu</label><Select value={role} onValueChange={(v) => setRole(v as DemoUser["role"])} disabled={busy}><SelectTrigger aria-labelledby="demo-role-label"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(demoRoles).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" className="primary-button" disabled={busy}>{busy ? "Ukládám…" : editing === "new" ? "Vytvořit uživatele" : "Uložit změny"}</Button>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={deleting !== null} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent><DialogTitle>Smazat testovací účet?</DialogTitle><DialogDescription>Účet {deleting?.display_name} bude odstraněn z databáze dema. Záznam o smazání zůstane v historii.</DialogDescription>
        <div className="demo-inline"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Zrušit</Button><Button variant="destructive" disabled={busy} onClick={async () => { if (deleting && await mutate({ action: "delete", id: deleting.id })) setDeleting(null); }}>{busy ? "Mažu…" : "Smazat účet"}</Button></div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  </section>;
}

export function DemoAccountDashboard({ signOutPath, local }: { signOutPath: string; local: boolean }) {
  const { data, error, busy, refresh, mutate } = useDemoAccounts();
  const [name, setName] = useState<string | null>(null);
  if (!data) return <AccountLoading busy={busy} error={error} retry={refresh} />;
  return <div className="demo-dashboard">
    <div className="account-bar"><span>{local ? "Místní demo" : "Soukromé demo"} · {data.me.display_name}</span><Button variant="outline" asChild><a href={signOutPath} target="_top">Odhlásit se</a></Button></div>
    <div className="demo-dashboard-grid">
      <section className="form-card"><h2>Můj účet</h2><p className="demo-muted">{local ? "Vývojový účet na tomto počítači." : "Přístup je spojený s tvým účtem ChatGPT."}</p>
        <form className="demo-user-form" onSubmit={async (e) => { e.preventDefault(); if (await mutate({ action: "self", display_name: name ?? data.me.display_name })) setName(null); }}>
          <label htmlFor="my-demo-name">Zobrazované jméno<Input id="my-demo-name" value={name ?? data.me.display_name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required disabled={busy} /></label>
          <label htmlFor="my-demo-email">E-mail přihlášeného účtu<Input id="my-demo-email" value={data.me.email} readOnly /></label>
          <p className="demo-muted">Vytvořeno {date(data.me.created_at)}. Změna jména se projeví jen v FameRiser.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" className="primary-button" disabled={busy}>{busy ? "Ukládám…" : "Uložit jméno"}</Button>
        </form>
      </section>
      <div className="demo-dashboard-links">
        <section className="form-card"><Users size={23} /><h2>Správa uživatelů</h2><p>{data.users.length - 1} testovacích účtů. Vytvářej účty, upravuj role a zkoušej blokování.</p><Button variant="outline" asChild><a href="/admin">Otevřít správu <ArrowUpRight size={16} /></a></Button></section>
        <section className="form-card"><ShieldCheck size={23} /><h2>Sociální účty</h2><p>Instagram můžeš zatím uložit jako soukromý návrh. Ověření a přihlášení přes sociální sítě čekají na zapojení.</p><Button variant="outline" asChild><a href="/connections">Připravit propojení <ArrowUpRight size={16} /></a></Button></section>
      </div>
    </div>
    <p className="notice">Žebříčky obsahují fiktivní profily. Tvoje testovací účty se v nich nezobrazují. Platby jsou vypnuté; údaje provozovatele doplníme před veřejným spuštěním.</p>
  </div>;
}
