"use client";
import {ServiceAdmin} from "./service-admin";
import { NoticeModeration } from "./notice-moderation";
import { ReviewModeration } from "./review-moderation";
import { DMVerificationInfo } from "./dm-verification-info";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Search,
  Pencil,
  EyeOff,
  Ban,
  Trash2,
  CreditCard,
  Users,
  Flag,
  Settings2,
  ArrowUpRight,
  Check,
  Download,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Profile,
  Settings,
  money,
  number,
  categories,
  platforms,
  allPlatforms,
} from "@/lib/rankme/config";
import { Avatar } from "./board";
import { DemoNote } from "./shell";
import { api } from "./join-form";
import { DemoAccountManager } from "./demo-account-manager";
export function Admin({
  demo,
  profiles,
  settings,
}: {
  demo: boolean;
  profiles: Profile[];
  settings: Settings;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [appName, setAppName] = useState(settings.name),
    [promoEnabled, setPromoEnabled] = useState(settings.promo_enabled === true),
    [minimum, setMinimum] = useState(settings.minimum / 100),
    [increment, setIncrement] = useState(settings.increment / 100),
    [blacklist, setBlacklist] = useState("bit.ly\ntinyurl.com\nt.co\ngoo.gl"),
    [allowed, setAllowed] = useState(""),
    [refunds, setRefunds] = useState(false),
    [editing, setEditing] = useState<any>(null),
    [editName, setEditName] = useState(""),
    [editBio, setEditBio] = useState(""),
    [removeAvatar, setRemoveAvatar] = useState(false),
    [confirmation, setConfirmation] = useState<any>(null);
  const refresh = async () => {
    try {
      const d = await api("admin");
      setData(d);
      setPromoEnabled(d.app_settings.find((s: any) => s.key === "public")?.value?.promo_enabled === true);
      const security = d.app_settings.find(
        (s: any) => s.key === "security",
      )?.value;
      setBlacklist(security?.blacklist.join("\n") || "");
      setAllowed(security?.allowed_domains.join("\n") || "");
      setRefunds(
        d.app_settings.find((s: any) => s.key === "payments")?.value
          .refunds_enabled || false,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (!demo) void refresh();
  }, [demo]);
  const mutate = async (action: string, id: string, value: any = {}) => {
    if(['moderate','edit','ban'].includes(action)){toast('Použij část Moderace → Odůvodněná moderace. Omezení vyžaduje důvod a vyrozumění vlastníka.');return;}
    if (demo) {
      toast(
        "Administrace je v demu pouze pro prohlížení. Změna nebyla uložena.",
      );
      return;
    }
    try {
      await api("admin", { action, id, value });
      toast.success("Změna je uložená včetně auditního záznamu.");
      setEditing(null);
      setConfirmation(null);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const list = demo ? profiles : data?.profiles || [];
  const filtered = list.filter(
    (p: any) =>
      (filter === "all" || p.status === filter) &&
      `${p.name} ${p.username} ${p.social_url}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      {demo && <DemoNote />}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {!demo && <div className="metric-grid admin-metrics">
        <div>
          <Users />
          <span>Profilů</span>
          <strong>{list.length}</strong>
        </div>
        <div>
          <CreditCard />
          <span>Potvrzené platby</span>
          <strong>
            {demo
              ? "—"
              : money(
                  (data?.payments || [])
                    .filter(
                      (p: any) =>
                        p.status === "paid" ||
                        p.status === "partially_refunded",
                    )
                    .reduce(
                      (s: number, p: any) => s + p.amount - p.refunded_amount,
                      0,
                    ),
                )}
          </strong>
        </div>
        <div>
          <Flag />
          <span>Otevřená nahlášení</span>
          <strong>
            {data?.reports?.filter((r: any) => r.status === "open").length || 0}
          </strong>
        </div>
        <div>
          <ShieldCheck />
          <span>Nedokončená propojení</span>
          <strong>
            {data?.social_connections?.filter(
              (r: any) => r.status !== "verified",
            ).length || 0}
          </strong>
        </div>
      </div>}
      <Tabs defaultValue={demo ? "users" : "profiles"} className="admin-tabs">
        <TabsList variant="line">
          {demo && <TabsTrigger value="users">Uživatelé</TabsTrigger>}
          <TabsTrigger value="profiles">Profily</TabsTrigger>
          <TabsTrigger value="reports">Moderace</TabsTrigger>
          <TabsTrigger value="payments">Platby</TabsTrigger>
          <TabsTrigger value="settings">Nastavení</TabsTrigger>
          <TabsTrigger value="taxonomy">Kategorie a sítě</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        {demo && <TabsContent value="users"><DemoAccountManager /></TabsContent>}
        <TabsContent value="profiles">
          <div className="admin-filters">
            <div className="search-field">
              <Search size={16} />
              <Input
                aria-label="Hledat v administraci"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Hledat profil, jméno nebo URL…"
              />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["all", "Všechny stavy"],
                  ["active", "Aktivní"],
                  ["under_review", "Kontrolované"],
                  ["pending_payment", "Čeká na platbu"],
                  ["hidden", "Skryté"],
                  ["banned", "Zablokované"],
                  ["deleted", "Odstraněné"],
                ].map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="admin-profile-list">
            {filtered.map((p: any) => (
              <article key={p.id}>
                <Avatar p={p} />
                <div className="admin-person">
                  <strong>{p.name}</strong>
                  <span>@{p.username}</span>
                  <a
                    href={p.demo ? "#" : p.social_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {p.social_url} <ArrowUpRight size={11} />
                  </a>
                </div>
                <span className={"status-pill " + p.status}>{p.status}</span>
                <strong className="admin-amount">{money(p.total_paid)}</strong>
                <div className="admin-row-actions">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Upravit ${p.name}`}
                    onClick={() => {
                      setEditing(p);
                      setEditName(p.name);
                      setEditBio(p.bio);
                    }}
                  >
                    <Pencil size={15} />
                  </Button>
                  <Select
                    value={
                      p.status === "pending_payment" ? "under_review" : p.status
                    }
                    onValueChange={(v) =>
                      mutate("moderate", p.id, { status: v })
                    }
                  >
                    <SelectTrigger
                      aria-label={`Stav ${p.name}`}
                      className="admin-status-select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "active",
                        "under_review",
                        "hidden",
                        "banned",
                        "deleted",
                      ].map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {p.user_id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Zablokovat vlastníka ${p.name}`}
                      onClick={() =>
                        setConfirmation({
                          action: "ban",
                          id: p.user_id,
                          value: { banned: true },
                          title: "Zablokovat účet a všechny jeho profily?",
                        })
                      }
                    >
                      <Ban size={15} />
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="reports">
          <ServiceAdmin demo={demo} profiles={data?.profiles||profiles}/><NoticeModeration demo={demo}/>
          <ReviewModeration demo={demo}/>
          <h2 className="tab-title">Nahlášené profily a komentáře</h2>
          {data?.reports
            ?.filter((r: any) => r.status === "open")
            .map((r: any) => (
              <div className="settings-card" key={r.id}>
                <div>
                  <h3>
                    {list.find((p: any) => p.id === r.profile_id)?.name ||
                      r.profile_id}{" "}
                    · {r.reason}
                  </h3>
                  <p>{r.details || "Bez doplnění."}</p>
                  <small>
                    {new Date(r.created_at).toLocaleString("cs-CZ")}
                  </small>
                </div>
                {r.reply_id ? <Button variant="outline" onClick={async()=>{try{await api('admin/replies',{id:r.reply_id,status:'hidden'});toast.success('Odpověď byla skryta.');await refresh()}catch(e){toast.error((e as Error).message)}}}>Skrýt odpověď</Button> : r.review_id ? <Button variant="outline" onClick={async()=>{try{await api('admin/reviews',{id:r.review_id,status:'hidden'});toast.success('Komentář byl skryt.');await refresh()}catch(e){toast.error((e as Error).message)}}}>Skrýt komentář</Button> : <Button variant="outline" onClick={()=>mutate('moderate',r.profile_id,{status:'under_review'})}>Prověřit profil</Button>}
                <Button onClick={() => mutate("report", r.id)}>Vyřešeno</Button>
              </div>
            ))}
          {!data?.reports?.some((r: any) => r.status === "open") && (
            <div className="empty-state">
              <ShieldCheck />
              <h3>Žádná otevřená nahlášení.</h3>
            </div>
          )}
          <h2 className="tab-title">Ověření vlastnictví</h2>
          <DMVerificationInfo />
          <h2 className="tab-title">Žádosti o odstranění údajů</h2>
          {data?.deletion_requests?.map((r: any) => (
            <div className="settings-card" key={r.id}>
              <div>
                <h3>Žádost {r.id}</h3>
                <p>
                  Účet {r.user_id} · {r.status==='awaiting_retention_review'?'Čeká na dokončení výmazu a posouzení uchování':r.status}
                </p>
                <p>
                  {new Date(r.created_at).toLocaleString("cs-CZ")} · {r.prepared_at?'Profily jsou skryté, propojení a příspěvky odstraněné.':'Starší žádost – dokončení úvodních kroků je potřeba ověřit.'}
                </p>
              </div>
            </div>
          ))}
          {!data?.deletion_requests?.length && (
            <p className="subtle-note">
              Žádné žádosti o odstranění osobních údajů.
            </p>
          )}
        </TabsContent>
        <TabsContent value="payments">
          <h2 className="tab-title">Platby a refundace</h2>
          {data?.payments?.length ? (
            <div className="payments-list">
              {data.payments.map((p: any) => (
                <article key={p.id}>
                  <CreditCard size={20} />
                  <div>
                    <strong>{money(p.amount)}</strong>
                    <p>
                      {p.status} ·{" "}
                      {new Date(p.created_at).toLocaleString("cs-CZ")}
                    </p>
                    <code>
                      {p.stripe_payment_id || p.stripe_checkout_id || p.id}
                    </code>
                  </div>
                  {p.status === "paid" && (
                    <Button
                      variant="outline"
                      disabled={!refunds}
                      onClick={() =>
                        setConfirmation({
                          action: "refund",
                          id: p.id,
                          title: `Požádat Stripe o vrácení ${money(p.amount)}?`,
                        })
                      }
                    >
                      <Undo2 size={14} /> Refundovat
                    </Button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <CreditCard />
              <h3>Žádné skutečné platby.</h3>
            </div>
          )}
        </TabsContent>
        <TabsContent value="settings">
          <div className="admin-settings">
            <section className="form-card">
              <h2>Žebříček a značka</h2>
              <label>
                Název aplikace
                <Input
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  maxLength={40}
                />
              </label>
              <div className="field-grid">
                <label>
                  Minimální vstup (Kč)
                  <Input
                    type="number"
                    min="1"
                    value={minimum}
                    onChange={(e) => setMinimum(Number(e.target.value))}
                  />
                </label>
                <label>
                  Minimální navýšení (Kč)
                  <Input
                    type="number"
                    min="1"
                    value={increment}
                    onChange={(e) => setIncrement(Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="check-line"><Checkbox checked={promoEnabled} onCheckedChange={v=>setPromoEnabled(v===true)} /> Povolit promo: prvních 1 000 ověřených profilů celkem s kreditem 5 USD zdarma</label>
              <p className="subtle-note">Jedno promo místo na konkrétní sociální účet, společná kapacita všech sítí. Stejné funkce jako placené umístění. Vypnutí zastaví nové vstupy, zachová získaná místa.</p>
              <Button
                onClick={() =>
                  mutate("settings", "public", {
                    promo_enabled: promoEnabled,
                    name: appName,
                    minimum: Math.round(minimum * 100),
                    increment: Math.round(increment * 100),
                  })
                }
              >
                Uložit nastavení
              </Button>
            </section>
            <section className="form-card">
              <h2>Ochrana odkazů</h2>
              <label>
                Zakázané domény · jedna na řádek
                <Textarea
                  rows={5}
                  value={blacklist}
                  onChange={(e) => setBlacklist(e.target.value)}
                />
              </label>
              <label>
                Schválené domény pro jiné sítě
                <Textarea
                  rows={3}
                  value={allowed}
                  onChange={(e) => setAllowed(e.target.value)}
                />
              </label>
              <p className="subtle-note">
                Nové domény před schválením ručně zkontroluj. Aplikace neprovádí
                antivirový audit cizích webů.
              </p>
              <Button
                onClick={() =>
                  mutate("settings", "security", {
                    blacklist: blacklist
                      .split("\n")
                      .map((s) => s.trim().toLowerCase())
                      .filter(Boolean),
                    allowed_domains: allowed
                      .split("\n")
                      .map((s) => s.trim().toLowerCase())
                      .filter(Boolean),
                  })
                }
              >
                Uložit domény
              </Button>
            </section>
            <section className="form-card">
              <h2>Refundace</h2>
              <label className="check-line">
                <Checkbox
                  checked={refunds}
                  onCheckedChange={(v) => setRefunds(v === true)}
                />
                Povolit administrátorům manuální refundace přes Stripe.
              </label>
              <Button
                onClick={() =>
                  mutate("settings", "payments", { refunds_enabled: refunds })
                }
              >
                Uložit oprávnění
              </Button>
            </section>
          </div>
        </TabsContent>
        <TabsContent value="taxonomy">
          <div className="taxonomy-grid">
            <div>
              <h2 className="tab-title">Kategorie</h2>
              {(
                data?.categories ||
                categories.map((c) => ({
                  id: c.toLowerCase(),
                  name: c,
                  active: true,
                }))
              ).map((c: any) => (
                <label className="taxonomy-row" key={c.id}>
                  {c.name}
                  <Checkbox
                    checked={c.active}
                    onCheckedChange={(v) =>
                      mutate("taxonomy", c.id, {
                        type: "category",
                        active: v === true,
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div>
              <h2 className="tab-title">Sociální sítě</h2>
              <p className="subtle-note">První etapa zahrnuje {platforms.join(", ")}. Dostupnost v nabídce sama nezprovozní ověřování.</p>
              {(
                data?.social_platforms ||
                allPlatforms.map((c) => ({
                  id: c.toLowerCase(),
                  name: c,
                  active: platforms.some((p) => p === c),
                }))
              ).map((c: any) => (
                <label className="taxonomy-row" key={c.id}>
                  {c.name}
                  {!platforms.some((p) => p === c.name) && <small>Další etapa</small>}
                  <Checkbox
                    checked={Boolean(c.active) && platforms.some((p) => p === c.name)}
                    disabled={!platforms.some((p) => p === c.name)}
                    onCheckedChange={(v) =>
                      mutate("taxonomy", c.id, {
                        type: "platform",
                        active: v === true,
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="audit">
          <h2 className="tab-title">Administrátorské akce</h2>
          {data?.admin_actions?.length ? (
            <div className="payments-list">
              {[...data.admin_actions].reverse().map((a: any) => (
                <article key={a.id}>
                  <ShieldCheck size={17} />
                  <div>
                    <strong>{a.action}</strong>
                    <p>{a.target_id}</p>
                    <small>
                      {new Date(a.created_at).toLocaleString("cs-CZ")} ·{" "}
                      {a.admin_id}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <ShieldCheck />
              <h3>Zatím žádné administrátorské akce.</h3>
            </div>
          )}
        </TabsContent>
      </Tabs>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogTitle>Upravit {editing?.name}</DialogTitle>
          <DialogDescription>
            Úprava se zapíše do auditní historie.
          </DialogDescription>
          <label>
            Jméno
            <Input
              value={editName}
              maxLength={60}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <label>
            Bio
            <Textarea
              value={editBio}
              maxLength={160}
              onChange={(e) => setEditBio(e.target.value)}
            />
          </label>
          <label className="check-line">
            <Checkbox
              checked={removeAvatar}
              onCheckedChange={(v) => setRemoveAvatar(v === true)}
            />
            Odstranit profilovou fotografii
          </label>
          <Button
            onClick={() =>
              mutate("edit", editing.id, {
                name: editName,
                bio: editBio,
                remove_avatar: removeAvatar,
              })
            }
          >
            Uložit
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirmation}
        onOpenChange={(v) => !v && setConfirmation(null)}
      >
        <DialogContent>
          <DialogTitle>{confirmation?.title}</DialogTitle>
          <DialogDescription>
            Akce se provede na serveru a bude zaznamenaná v auditu.
          </DialogDescription>
          <Button
            variant="destructive"
            onClick={async () => {
              if (confirmation.action === "refund") {
                if (demo) {
                  toast("Refundace nejsou v demu dostupné.");
                  return;
                }
                try {
                  const r = await api("admin/refund", { id: confirmation.id });
                  toast(r.message);
                  setConfirmation(null);
                  await refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              } else
                await mutate(
                  confirmation.action,
                  confirmation.id,
                  confirmation.value,
                );
            }}
          >
            Potvrdit akci
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
