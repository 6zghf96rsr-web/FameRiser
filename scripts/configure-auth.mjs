import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

// Secrets are read from the local environment; never echoed or written to source.
const env = process.env;
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APP_URL",
  "ANALYTICS_SECRET",
];
const missing = required.filter((key) => !env[key]);
const providers = [
  ["google", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ["apple", "APPLE_SERVICES_ID", "APPLE_CLIENT_SECRET"],
  ["facebook", "FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
  ["twitch", "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"],
  ["x", "X_CLIENT_ID", "X_CLIENT_SECRET"],
];
const enabled = providers.filter(([, id, secret]) => env[id] && env[secret]);
console.log(
  JSON.stringify(
    {
      missing,
      providerCredentialsPresent: Object.fromEntries(providers.map(([name, id, secret]) => [name, Boolean(env[id] && env[secret])])),
      demo: env.RANKME_DEMO === "true",
      paymentsEnabled: env.PAYMENTS_ENABLED === "true",
    },
    null,
    2,
  ),
);
if (!process.argv.includes("--apply")) {
  console.log(
    "Kontrola nic nezměnila. Po doplnění přístupů použij npm run auth:configure -- --apply.",
  );
  process.exit(0);
}
if (missing.length || !env.SUPABASE_ACCESS_TOKEN || !enabled.length) {
  console.error(
    "Nastavení nebylo změněno. Doplň chybějící přístupy, SUPABASE_ACCESS_TOKEN a alespoň jednoho poskytovatele.",
  );
  process.exit(1);
}
const supabaseURL = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
if (
  !/^[a-z0-9]{20}\.supabase\.co$/.test(supabaseURL.hostname) ||
  supabaseURL.protocol !== "https:" || supabaseURL.username || supabaseURL.password ||
  supabaseURL.port || supabaseURL.pathname !== "/" || supabaseURL.search || supabaseURL.hash
)
  throw new Error("Použij URL svého hostovaného Supabase projektu.");
const app = new URL(env.APP_URL);
if (app.protocol !== "https:")
  throw new Error("Produkční adresa musí být HTTPS.");
if (
  app.username ||
  app.password ||
  app.pathname !== "/" ||
  app.search ||
  app.hash
)
  throw new Error("APP_URL musí být pouze origin webu.");
const endpoint = `https://api.supabase.com/v1/projects/${supabaseURL.hostname.split(".")[0]}/config/auth`;
const request = async (method, body) => {
  const response = await fetch(endpoint, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw new Error(
      `Supabase nastavení selhalo (HTTP ${response.status}). Podrobnosti nejsou vypsané, aby se nezobrazily tajné klíče.`,
    );
  return response.json();
};
try {
  const current = await request("GET");
  const redirects = [
    ...new Set([
      ...(current.uri_allow_list || "").split(",").filter(Boolean),
      ...[
        "/auth/callback",
        "/auth/callback?**",
        "/auth/confirm",
        "/login?reset=1",
      ].map((path) => app.origin + path),
    ]),
  ];
  const patch = {
    site_url: app.origin,
    uri_allow_list: redirects.join(","),
    security_manual_linking_enabled: true,
  };
  for (const [name, id, secret] of enabled)
    Object.assign(patch, {
      [`external_${name}_enabled`]: true,
      [`external_${name}_client_id`]: env[id],
      [`external_${name}_secret`]: env[secret],
    });
  await request("PATCH", patch);
  const verified = await request("GET");
  if (
    enabled.some(([name, id]) => verified[`external_${name}_enabled`] !== true || verified[`external_${name}_client_id`] !== env[id]) ||
    verified.site_url !== app.origin ||
    redirects.some((url) => !(verified.uri_allow_list || "").split(",").includes(url)) ||
    !verified.security_manual_linking_enabled
  )
    throw new Error("Supabase nepotvrdil všechna nastavení.");
  console.log(
    "Poskytovatelé a návratové adresy jsou nastavené v Supabase. Zbývá nastavit prostředí hostovaného webu a projít skutečné přihlášení. Registraci vývojářských aplikací u jednotlivých sítí tento skript nenahrazuje.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
