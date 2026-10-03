import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Private saved links. These are never payment records or proof of ownership.
export const instagramAccounts = sqliteTable("instagram_accounts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  username: text("username").notNull(),
  socialUrl: text("social_url").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("instagram_owner_username").on(table.ownerId, table.username)]);

export const instagramWriteLimits = sqliteTable("instagram_write_limits", {
  ownerId: text("owner_id").primaryKey(),
  windowStart: integer("window_start").notNull(),
  writes: integer("writes").notNull(),
});

// Isolated demo workspaces. A demo role never grants live FameRiser permissions.
export const demoUsers = sqliteTable("demo_users", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  uniqueIndex("demo_owner_email").on(t.ownerId, t.email),
  uniqueIndex("demo_workspace_owner").on(t.ownerId).where(sql`${t.kind} = 'owner'`),
  check("demo_kind", sql`${t.kind} IN ('owner', 'test')`),
  check("demo_role", sql`${t.role} IN ('admin', 'moderator', 'user')`),
  check("demo_status", sql`${t.status} IN ('active', 'blocked')`),
  check("demo_owner_protected", sql`${t.kind} != 'owner' OR (${t.role} = 'admin' AND ${t.status} = 'active')`),
]);

export const demoUserEvents = sqliteTable("demo_user_events", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  targetId: text("target_id").notNull(),
  action: text("action").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("demo_events_owner_time").on(t.ownerId, t.createdAt)]);

export const demoWriteLimits = sqliteTable("demo_write_limits", {
  ownerId: text("owner_id").primaryKey(),
  windowStart: integer("window_start").notNull(),
  writes: integer("writes").notNull(),
});

// Shared public-read budget. The key is an HMAC of the edge IP and UTC day;
// neither a raw address nor a client-supplied identifier is stored here.
export const publicReadLimits = sqliteTable("public_read_limits", {
  subjectHash: text("subject_hash").primaryKey(),
  windowStart: integer("window_start").notNull(),
  requests: integer("requests").notNull(),
  lastSeen: integer("last_seen").notNull(),
}, (table) => [index("public_read_limits_last_seen").on(table.lastSeen)]);
