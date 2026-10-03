// Sites supplies these values when the Worker starts. Direct NEXT_PUBLIC_ reads
// can be replaced with build-time values by Vite/Next, before hosting is configured.
const runtimeValue = (name: string) => process.env[name] || "";

export function publicSupabaseConfig() {
  return {
    url: runtimeValue("NEXT_PUBLIC_SUPABASE_URL"),
    key: runtimeValue("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}
