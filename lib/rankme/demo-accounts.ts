import { z } from "zod";

export const demoRoles = { user: "Uživatel", moderator: "Moderátor", admin: "Správce" } as const;
export const demoStatuses = { active: "Aktivní", blocked: "Blokovaný" } as const;
export type DemoUser = {
  id: string;
  kind: "owner" | "test";
  display_name: string;
  email: string;
  role: keyof typeof demoRoles;
  status: keyof typeof demoStatuses;
  created_at: number;
  updated_at: number;
};
export const demoActions = {
  created: "Vytvoření testovacího účtu",
  updated: "Úprava testovacího účtu",
  blocked: "Zablokování účtu",
  unblocked: "Odblokování účtu",
  deleted: "Smazání testovacího účtu",
  self_updated: "Úprava vlastního jména",
} as const;
export type DemoEvent = { id: string; target_id: string; action: keyof typeof demoActions; created_at: number };
export type DemoAccounts = { me: DemoUser; users: DemoUser[]; events: DemoEvent[]; limit: number };
export type DemoIdentity = { userId: string; email: string; displayName: string };

const name = z.string().trim().min(2).max(80).refine((s) => !/[\u0000-\u001f\u007f]/.test(s));
const email = z.string().trim().toLowerCase().max(254).email().refine((s) => s.endsWith(".test"));
const details = { display_name: name, email, role: z.enum(["user", "moderator", "admin"]) };
export const demoAccountInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...details }).strict(),
  z.object({ action: z.literal("update"), id: z.string().uuid(), ...details }).strict(),
  z.object({ action: z.literal("status"), id: z.string().uuid(), status: z.enum(["active", "blocked"]) }).strict(),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("self"), display_name: name }).strict(),
]);
export type DemoAccountInput = z.infer<typeof demoAccountInput>;
export class DemoAccountError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
