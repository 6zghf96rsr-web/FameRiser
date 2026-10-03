import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { Button } from "@/components/ui/button";
import { InstagramAccounts } from "./instagram-accounts";
import { demoEnabled } from "@/lib/supabase/server";

export async function InstagramAccess() {
  const user = await getChatGPTUser();
  if (user) return <InstagramAccounts demo={demoEnabled()} />;
  return <section className="form-card">
    <h2>Připravit propojení Instagramu</h2>
    <p>Přihlas se přes ChatGPT, abys mohl soukromě uložit návrh propojení Instagramu. Účet bude připojený až po ověření, které zatím čeká na spuštění. Propojení bude zdarma.</p>
    <Button className="primary-button" asChild><a href={chatGPTSignInPath("/instagram")} target="_top">Přihlásit přes ChatGPT</a></Button>
  </section>;
}
