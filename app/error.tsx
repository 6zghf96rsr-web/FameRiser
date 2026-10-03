"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="inner-page">
      <div className="page-intro">
        <span className="page-eyebrow">CHVILKU STRPENÍ</span>
        <h1>Načtení se nepovedlo.</h1>
        <p>
          Zkus stránku načíst znovu. Tvoje potvrzené platby tím nejsou
          ovlivněné.
        </p>
      </div>
      <Button onClick={reset}>Zkusit znovu</Button>
    </main>
  );
}
