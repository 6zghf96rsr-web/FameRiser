import { MessageCircle, ShieldCheck } from "lucide-react";
import { dmCodeValidityHours, platforms } from "@/lib/rankme/config";

export function DMVerificationInfo() {
  return (
    <section className="form-card connection-form">
      <div className="connection-section-title">
        <MessageCircle />
        <h2>Ověření zprávou od FameRiser</h2>
      </div>
      <p className="connection-badge">Čeká na spuštění</p>
      <p className="subtle-note">První etapa: {platforms.join(", ")}. U Facebooku počítáme s osobními profily i stránkami. Další sítě přidáme později.</p>
      <p className="subtle-note">
        Připravujeme ověření soukromým kódem. Oficiální profily FameRiser ani
        odesílání zpráv zatím nejsou zprovozněné. Žádný kód teď neodesíláme.
      </p>
      <ol className="subtle-note">
        <li>Na podporované síti pošleš oficiálnímu profilu FameRiser zprávu „FameRiser“.</li>
        <li>Odpovíme jednorázovým kódem s platností {dmCodeValidityHours} hodin a krátkým návodem.</li>
        <li>Přihlásíš se do FameRiser, vložíš kód a potvrdíš propojení účtu, ze kterého jsi zprávu poslal/a.</li>
      </ol>
      <p className="subtle-note">
        Tento postup připravujeme nejprve pro Instagram. U ostatních sítí
        zpřístupníme ověřování podle jejich možností. Pro YouTube připravujeme
        ověření vlastněného kanálu přes Google. Pouhé uložení odkazu účet neověří.
      </p>
      <div className="connection-section-title">
        <ShieldCheck size={18} />
        <strong>Propojení a ověření zdarma. Platba až za místo v žebříčku.</strong>
      </div>
    </section>
  );
}
