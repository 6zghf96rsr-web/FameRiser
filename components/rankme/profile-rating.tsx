"use client";
import { useEffect, useState } from "react";
import { Star, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api } from "./join-form";

type Rating = {
  count: number;
  average: number | null;
  mine: number | null;
  can_rate: boolean;
  is_owner: boolean;
  signed_in: boolean;
};
export function ProfileRating({
  id,
  slug,
  demo,
}: {
  id: string;
  slug: string;
  demo: boolean;
}) {
  const [data, setData] = useState<Rating | null>(
    demo
      ? {
          count: 0,
          average: null,
          mine: null,
          can_rate: false,
          is_owner: false,
          signed_in: false,
        }
      : null,
  );
  const [score, setScore] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    void api(`profiles/${id}/ratings`)
      .then((r: Rating) => {
        if (!cancelled) {
          setData(r);
          setScore(r.mine ? String(r.mine) : "");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, demo]);
  const save = async (value: number | null) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api(`profiles/${id}/ratings`, { score: value });
      setData(r);
      setScore(r.mine ? String(r.mine) : "");
      setMessage(
        value === null
          ? "Tvoje hodnocení bylo odebráno."
          : "Tvoje hodnocení je uložené.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="profile-rating-card" aria-labelledby="rating-title">
      <div className="rating-heading">
        <div>
          <h2 id="rating-title">Hodnocení komunity</h2>
          <p>
            Hodnotit můžeš i bez placeného profilu. Hvězdičky nemění pořadí v
            žebříčku.
          </p>
        </div>
        <div className="rating-average">
          <Star size={25} />
          <strong>
            {data?.average !== null && data?.average !== undefined
              ? new Intl.NumberFormat("cs-CZ", {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                }).format(data.average)
              : "—"}
          </strong>
          <span>{data ? `${data.count} hodnocení` : "Načítání…"}</span>
        </div>
      </div>
      {data && (data.can_rate || demo) && (
        <div className="rating-form">
          <p>
            {data.mine
              ? "Tvoje hodnocení · můžeš ho změnit"
              : "Jak hodnotíš tento profil?"}
          </p>
          <RadioGroup
            className="rating-choices"
            value={score}
            onValueChange={setScore}
            disabled={busy || demo}
            aria-label="Hodnocení od 1 do 5 hvězdiček"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                className={
                  "rating-choice " + (score === String(n) ? "selected" : "")
                }
                htmlFor={`rating-${id}-${n}`}
                key={n}
              >
                <RadioGroupItem id={`rating-${id}-${n}`} value={String(n)} />
                <span>{n}</span>
                <Star size={18} aria-hidden="true" />
              </label>
            ))}
          </RadioGroup>
          <div className="rating-actions">
            <Button
              className="primary-button"
              disabled={demo || busy || !score || Number(score) === data.mine}
              onClick={() => void save(Number(score))}
            >
              {busy && <LoaderCircle size={16} className="animate-spin" />}
              {data.mine ? "Uložit změnu" : "Uložit hodnocení"}
            </Button>
            {data.mine && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void save(null)}
              >
                Odebrat moje hodnocení
              </Button>
            )}
          </div>
          <small>
            Jeden hlas na účet FameRiser a profil. Zobrazuje se pouze průměr a
            počet hlasů; tvůj účet se veřejně nevypisuje.
          </small>
        </div>
      )}
      {demo ? (
        <div className="notice">
          V demu se hodnocení neukládá. U skutečných profilů bude dostupné po
          přihlášení, bez nutnosti platby.
        </div>
      ) : data?.is_owner ? (
        <p className="subtle-note">Vlastní profil nemůžeš hodnotit.</p>
      ) : data && !data.signed_in ? (
        <Button variant="outline" asChild>
          <a href={`/login?next=${encodeURIComponent(`/p/${slug}`)}`}>
            Přihlásit se a ohodnotit zdarma
          </a>
        </Button>
      ) : data && !data.can_rate ? (
        <p className="subtle-note">Tento účet momentálně nemůže hodnotit.</p>
      ) : null}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
