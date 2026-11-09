// Roles and what each can do. The database enforces the same rules (migration 012); the app hides what you can't use.
import type { Role } from "./types";

export type Action = "write" | "delete" | "export" | "settings" | "team" | "objects" | "assign" | "seeAll";
const RULES: Record<Role, Action[]> = {
  owner: ["write", "delete", "export", "settings", "team", "objects", "assign", "seeAll"],
  admin: ["write", "delete", "export", "settings", "team", "objects", "assign", "seeAll"],
  manager: ["write", "delete", "export", "assign", "seeAll"],
  rep: ["write"],
  viewer: ["seeAll"],
};
export const can = (role: Role, a: Action) => RULES[role].includes(a);

export const ROLES: { id: Exclude<Role, "owner">; label: string; text: string }[] = [
  { id: "admin", label: "Admin", text: "Everything, including settings, team and billing-level changes." },
  { id: "manager", label: "Manager", text: "Sees and edits all records, assigns work, exports and deletes. No settings or team." },
  { id: "rep", label: "Sales rep", text: "Works on records. Can be limited to their own leads and deals. Can't delete or export." },
  { id: "viewer", label: "Read-only", text: "Can look at everything, can't change anything." },
];
export const roleLabel = (r: Role) => (r === "owner" ? "Owner" : ROLES.find((x) => x.id === r)?.label ?? r);
