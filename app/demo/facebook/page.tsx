import type { Metadata } from "next";
import { FacebookDemo } from "@/components/rankme/facebook-demo";

export const metadata: Metadata = {
  title: "Facebook Fame — testovací náhled | FameRiser",
  description: "Oddělený náhled se 100 fiktivními Facebook profily.",
  robots: { index: false, follow: false },
};
export default function FacebookDemoPage() { return <FacebookDemo />; }
