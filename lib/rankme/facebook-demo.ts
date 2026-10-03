import { orderProfiles, type Profile } from "./config";

const firstNames = ["Alex", "Robin", "Sami", "Charlie", "Taylor", "Jamie", "Niki", "Noa", "Dani", "Kim"];
const studioNames = ["Lumio", "Velora", "Nuvio", "Solumi", "Oriva", "Zenvio", "Melori", "Kavira", "Tivelo", "Avori"];
const themes = [
  ["Photography", "Fotím přírodu, městské detaily a malé příběhy všedních dnů."],
  ["Fitness", "Sdílím pohybové výzvy a tipy pro radost z každodenního pohybu."],
  ["Artists", "Kreslím barevné světy a ukazuji, jak vznikají moje ilustrace."],
  ["Music", "Tvořím hudbu a sdílím zákulisí domácího nahrávání."],
  ["Lifestyle", "Objevuji nová místa a inspiraci pro pomalejší život."],
  ["Comedy", "Krátké scénky a humorné postřehy z každodenního života."],
  ["Gamers", "Herní příběhy, tipy a novinky pro naši komunitu."],
  ["Business", "Nápady a zkušenosti ze světa malých kreativních projektů."],
  ["Developers", "Programuji drobné aplikace a ukazuji, jak fungují."],
  ["Creators", "Kreativní pokusy, vlastní projekty a inspirace pro další tvorbu."],
];

// Static fixtures used exclusively by /demo/facebook. Never written to account,
// verification, payment, analytics or promotion tables.
export const facebookDemoProfiles: Profile[] = Array.from({ length: 100 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0");
  const verified = index < 50;
  const createdAt = new Date(Date.UTC(2026, 8, 22, 8, index)).toISOString();
  const [category, bio] = themes[index % themes.length];
  return {
    id: `demo-facebook-${number}`, name: `${firstNames[index % 10]} ${studioNames[Math.floor(index / 10)]}`,
    username: `demo.facebook.${number}`, slug: `demo-facebook-${number}`,
    bio, social_bio: bio, category, platform: "Facebook", avatar_url: null,
    social_url: "", language: "cs", country: "CZ", region: "",
    total_paid: 0, rank_score: 0, today_paid: 0, week_paid: 0, month_paid: 0,
    views: 0, clicks: 0, verified, demo: true,
    status: verified ? "active" : "pending_verification",
    promo_granted_at: verified ? createdAt : null,
    created_at: createdAt, reached_amount_at: createdAt,
  };
});

export const facebookDemoLeaderboard = orderProfiles(
  facebookDemoProfiles.filter(profile => profile.verified), "all", "Facebook",
);
