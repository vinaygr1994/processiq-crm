// Lets shared logic written for the engine's Db (bookings, forms) run against the signed-in app store.
import type { Db } from "./engine/engine";
import type { useCrm } from "./store";

type Crm = ReturnType<typeof useCrm>;
export function storeDb(crm: Pick<Crm, "data" | "add" | "update">): Db {
  return {
    async list(t) { return crm.data[t].slice() as never; },
    async insert(t, row) { const r = await crm.add(t, row as never); if (!r) throw new Error("Couldn't save. Check your connection and try again."); return r as never; },
    async update(t, id, patch) { await crm.update(t, id, patch as never); },
    async claim() { return true; },
    async claimCampaign() { return false; },
  };
}
