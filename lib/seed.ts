import type { Rows } from "./types";
import { STARTERS } from "./engine/starters";

const M = 60000, H = 3600000, D = 86400000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

export function seedRows(): Rows {
  const c = (id: string, name: string, email: string, phone: string, source: string, age: number) =>
    ({ id, name, email, phone, company: "", tags: ["homeowner"], source, unsubscribed: false, created_at: ago(age) });
  const deal = (o: Partial<Rows["deals"][number]> & Pick<Rows["deals"][number], "id" | "title" | "stage" | "contact_id" | "created_at">): Rows["deals"][number] => ({
    value: 0, source: "", project: "", budget: "", address: "", rep: "", lost_reason: "", stage_at: o.created_at, quote_sent_at: null, ...o,
  });
  return {
    contacts: [
      c("c1", "Sarah Collins", "sarah@collins.example", "555-0111", "Google Ads", 10 * M),
      c("c2", "James Okafor", "james@okafor.example", "555-0112", "Website form", 3 * D),
      c("c3", "Priya Nair", "priya@nair.example", "555-0113", "Referral", 8 * D),
      c("c4", "Tom Becker", "tom@becker.example", "555-0114", "Facebook / Instagram", 14 * D),
      c("c5", "Linda Park", "linda@park.example", "555-0115", "Google Ads", 30 * D),
      c("c6", "Marcus Webb", "marcus@webb.example", "555-0116", "Yelp / Houzz", 40 * D),
      c("c7", "Ava Johnson", "ava@johnson.example", "555-0117", "Referral", 50 * D),
    ],
    deals: [
      deal({ id: "d1", title: "Kitchen remodel · Sarah Collins", stage: "new", contact_id: "c1", project: "Kitchen remodel", budget: "$30–60k", source: "Google Ads", address: "San Diego, CA", rep: "Maria", created_at: ago(10 * M) }),
      deal({ id: "d2", title: "Bathroom remodel · James Okafor", stage: "visit_booked", contact_id: "c2", project: "Bathroom remodel", budget: "$10–30k", source: "Website form", address: "La Mesa, CA", rep: "Dan", created_at: ago(3 * D), stage_at: ago(2 * D) }),
      deal({ id: "d3", title: "Basement finishing · Priya Nair", stage: "visit_done", contact_id: "c3", project: "Basement finishing", budget: "$30–60k", source: "Referral", address: "Chula Vista, CA", rep: "Maria", created_at: ago(8 * D), stage_at: ago(1 * D) }),
      deal({ id: "d4", title: "Whole-home renovation · Tom Becker", stage: "quoted", contact_id: "c4", value: 42000, project: "Whole-home renovation", budget: "$100k+", source: "Facebook / Instagram", address: "Carlsbad, CA", rep: "Maria", created_at: ago(14 * D), stage_at: ago(6 * D), quote_sent_at: ago(6 * D) }),
      deal({ id: "d5", title: "Kitchen remodel · Linda Park", stage: "won", contact_id: "c5", value: 28500, project: "Kitchen remodel", budget: "$30–60k", source: "Google Ads", address: "Encinitas, CA", rep: "Dan", created_at: ago(30 * D), stage_at: ago(9 * D) }),
      deal({ id: "d6", title: "Home addition · Marcus Webb", stage: "lost", contact_id: "c6", value: 64000, project: "Home addition", budget: "$60–100k", source: "Yelp / Houzz", address: "Poway, CA", rep: "Dan", lost_reason: "Price too high", created_at: ago(40 * D), stage_at: ago(20 * D) }),
      deal({ id: "d7", title: "Roofing / exterior · Ava Johnson", stage: "completed", contact_id: "c7", value: 15200, project: "Roofing / exterior", budget: "$10–30k", source: "Referral", address: "El Cajon, CA", rep: "Maria", created_at: ago(50 * D), stage_at: ago(2 * D) }),
    ],
    visits: [
      { id: "v2", deal_id: "d2", contact_id: "c2", rep: "Dan", starts_at: ahead(30 * H), status: "scheduled", priority: "", result: "", created_at: ago(2 * D) },
      { id: "v3", deal_id: "d3", contact_id: "c3", rep: "Maria", starts_at: ago(1 * D + 2 * H), status: "done", priority: "hot", result: "Walls are dry. Wants a bar area and egress window. Decision maker is Priya.", created_at: ago(5 * D) },
      { id: "v4", deal_id: "d4", contact_id: "c4", rep: "Maria", starts_at: ago(9 * D), status: "done", priority: "warm", result: "Full gut of kitchen and two baths. Needs phased schedule.", created_at: ago(12 * D) },
    ],
    autolog: [
      { id: "l1", deal_id: "d4", kind: "Quote", message: "Quote for $42,000 sent to Tom Becker", tone: "info", key: "quote:d4", created_at: ago(6 * D) },
      { id: "l2", deal_id: "d4", kind: "Quote", message: "Day-2 quote follow-up sent", tone: "info", key: "q2:d4", created_at: ago(4 * D) },
      { id: "l3", deal_id: "d4", kind: "Quote", message: "Day-5 quote follow-up sent", tone: "info", key: "q5:d4", created_at: ago(1 * D) },
      { id: "l4", deal_id: "d5", kind: "Won", message: "Contract signed · Closed Won $28,500", tone: "won", key: "won:d5", created_at: ago(9 * D) },
      { id: "l5", deal_id: "d1", kind: "Lead", message: "New lead from Google Ads: Sarah Collins, Kitchen remodel", tone: "info", key: "lead:d1", created_at: ago(10 * M) },
      { id: "l6", deal_id: "d1", kind: "Routing", message: "Duplicate check passed · assigned to Maria by round robin", tone: "info", key: "route:d1", created_at: ago(10 * M) },
      { id: "l7", deal_id: "d1", kind: "Auto", message: "Speed-to-lead email sent in 38 seconds", tone: "info", key: "speed:d1", created_at: ago(9 * M) },
      { id: "l8", deal_id: "d1", kind: "Task", message: "Call task created for Maria, due in 15 min", tone: "info", key: "calltask:d1", created_at: ago(9 * M) },
      { id: "l9", deal_id: "d7", kind: "Review", message: "Review request sent to Ava Johnson", tone: "info", key: "review:d7", created_at: ago(2 * D) },
      { id: "l10", deal_id: "d6", kind: "Lost", message: "Marked lost: Price too high · moved to 90-day nurture", tone: "warn", key: "lost:d6", created_at: ago(20 * D) },
    ],
    tasks: [
      { id: "t1", title: "Call Sarah Collins back (new Google Ads lead)", due_date: null, done: false, contact_id: "c1", deal_id: "d1", created_at: ago(9 * M) },
      { id: "t2", title: "Send Priya the quote for the basement", due_date: null, done: false, contact_id: "c3", deal_id: "d3", created_at: ago(1 * D) },
    ],
    activities: [
      { id: "a1", contact_id: "c4", kind: "call", body: "Tom wants to compare with one other contractor. Asked about financing options.", created_at: ago(4 * D) },
      { id: "a2", contact_id: "c3", kind: "note", body: "Priya prefers text over calls. Best time is after 5pm.", created_at: ago(6 * D) },
    ],
    templates: [
      { id: "tp1", name: "Quick follow-up", subject: "Following up, {{first_name}}", body: "Hi {{first_name}},\n\nJust checking in to see if you had any questions about your project. Happy to jump on a quick call whenever suits you.\n\nBest,", created_at: ago(10 * D) },
    ],
    campaigns: [],
    emails: [],
    segments: [],
    workflows: STARTERS.map((w) => ({ ...w, id: "wf-" + w.template_id, active: true, activated_at: new Date().toISOString(), created_at: new Date().toISOString() })),
    workflow_runs: [],
    settings: [
      { id: "s1", business_name: "Greenleaf Renovations", sender_name: "Maria from Greenleaf", reply_to: "", address: "123 Main St, San Diego, CA", signature: "Maria\nGreenleaf Renovations", reps: ["Maria", "Dan"], owner_email: "", review_link: "https://g.page/r/your-review-link", booking_link: "", automations_off: [], rr_index: 1, timezone: "America/Toronto", starters_installed: true, intake_key: "demo-intake-key", stage_labels: {}, custom_fields: [], created_at: ago(30 * D) },
    ],
  };
}
