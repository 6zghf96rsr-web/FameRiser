import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { Button } from "@/components/ui/button";
import { DemoAccountDashboard } from "./demo-account-manager";

function localDemo() {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(process.env.APP_URL || "");
}

export async function DemoAccess({ children, returnTo }: { children: React.ReactNode; returnTo: string }) {
  const user = await getChatGPTUser();
  if (user) return children;
  return <DemoSignIn returnTo={returnTo} />;
}

export async function DemoSignIn({ returnTo = "/dashboard" }: { returnTo?: string }) {
  const user = await getChatGPTUser();
  const local = localDemo();
  return <section className="form-card demo-signin">
    <span className="page-eyebrow">SOUKROMÉ DEMO</span>
    <h2>{user ? "Tvůj účet je připravený" : "Začni zkoušet FameRiser"}</h2>
    <p>Uprav svůj účet a vyzkoušej správu testovacích uživatelů. Změny se ukládají do databáze. Platby jsou vypnuté.</p>
    {local && <p className="notice">Na tomto počítači vstoupíš do dema s místním testovacím účtem. Skutečné přihlášení přes sociální sítě připravíme později.</p>}
    <Button className="primary-button" asChild>
      <a href={user ? returnTo : chatGPTSignInPath(returnTo)} target="_top">
        {user ? "Pokračovat do účtu" : local ? "Otevřít místní demo" : "Pokračovat přes ChatGPT"}
      </a>
    </Button>
    <p className="demo-muted">Připojení sociálních sítí bude zdarma. Do žebříčku se profil dostane až po ověření a zaplacení.</p>
  </section>;
}

export async function DemoDashboardAccess() {
  return <DemoAccess returnTo="/dashboard">
    <DemoAccountDashboard signOutPath={chatGPTSignOutPath("/login")} local={localDemo()} />
  </DemoAccess>;
}
