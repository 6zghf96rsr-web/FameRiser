import type { Metadata } from "next";
import { APP } from "@/lib/rankme/config";
import { getBoardSettings } from "@/lib/rankme/data";
import "./globals.css";
import "./fameriser-fonts.css";
import "./fameriser-design.css";
import "./network-colors.css";
import "./fameriser-arena.css";
import "./fameriser-discovery.css";
import "./fameriser-afterglow.css";
import { Providers } from "@/components/rankme/shell";
export async function generateMetadata(): Promise<Metadata> {
  const b = await getBoardSettings();
  return {
    title: `${b.settings.name} — Pay. Rank. Get Seen.`,
    description:
      "FameRiser spojuje ověřené sociální účty creatora. Pořadí určuje součet uznaných plateb a FameCreditů.",
    icons: { icon: "/brand/fameriser-fr-icon.png", shortcut: "/brand/fameriser-fr-icon.png", apple: "/brand/fameriser-fr-icon.png" },
    robots: b.demo ? { index: false, follow: false } : undefined,
  };
}
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
