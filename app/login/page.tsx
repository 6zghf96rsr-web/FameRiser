import { PageShell } from "@/components/rankme/shell";
import { LoginForm } from "@/components/rankme/login-form";
import { demoEnabled, publicConfig } from "@/lib/supabase/server";
import { authStatus } from "@/lib/rankme/auth-status";
import { DemoSignIn } from "@/components/rankme/demo-access";
export const dynamic = "force-dynamic";
export default async function Login() {
  return (
    <PageShell
      title="Vítej ve FameRiseru."
      eyebrow="TVŮJ ÚČET"
      description="Přihlas se nebo si vytvoř účet."
    >
      {demoEnabled() ? <DemoSignIn /> : <LoginForm
        demo={demoEnabled()}
        config={publicConfig()}
        status={await authStatus()}
        appUrl={process.env.APP_URL}
      />}
    </PageShell>
  );
}
