import { PageShell } from "@/components/rankme/shell";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <PageShell title="Tohle místo je prázdné." eyebrow="404">
      <div className="notice">
        Profil nebo stránka neexistuje, případně už není veřejně dostupná.
      </div>
      <Button asChild>
        <a href="/">Zpět na žebříček</a>
      </Button>
    </PageShell>
  );
}
