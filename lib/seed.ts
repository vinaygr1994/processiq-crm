import type { Rows } from "./types";
import { STARTERS } from "./engine/starters";

const M = 60000, H = 3600000, D = 86400000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();
/** A local clock time some days from now, e.g. at(1, 10) = tomorrow 10:00. */
const at = (days: number, hour: number, mins = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, mins, 0, 0); return d.toISOString(); };

export function seedRows(): Rows {
  const CO: Record<string, string> = { c1: "Collins Dental Studio", c2: "Okafor Physiotherapy", c3: "Nair Aesthetics", c4: "Becker Fitness Club", c5: "Park & Co. Realty", c6: "Webb Consulting", c7: "Johnson Wellness Spa" };
  const day = (n: number) => new Date(Date.now() + n * D).toISOString().slice(0, 10);
  const c = (id: string, name: string, email: string, phone: string, source: string, age: number) =>
    ({ id, name, email, phone, company: CO[id] ?? "", tags: ["customer"], source, unsubscribed: false, owner: ["c2", "c5", "c6"].includes(id) ? "Dan" : "Maria", created_at: ago(age) });
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
      c("c6", "Marcus Webb", "marcus@webb.example", "555-0116", "LinkedIn", 40 * D),
      c("c7", "Ava Johnson", "ava@johnson.example", "555-0117", "Referral", 50 * D),
    ],
    deals: [
      deal({ id: "d1", title: "Patient booking system · Collins Dental", stage: "new", contact_id: "c1", value: 4800, project: "New customer", budget: "", source: "Google Ads", address: "Toronto, ON", rep: "Maria", priority: "high", close_date: day(21), created_at: ago(10 * M) }),
      deal({ id: "d2", title: "Clinic CRM setup · Okafor Physio", stage: "visit_booked", contact_id: "c2", value: 7200, project: "Consulting", budget: "", source: "Website form", address: "Mississauga, ON", rep: "Dan", priority: "medium", close_date: day(14), created_at: ago(3 * D), stage_at: ago(2 * D) }),
      deal({ id: "d3", title: "Marketing automation · Nair Aesthetics", stage: "qualified", contact_id: "c3", value: 12500, project: "New customer", budget: "", source: "Referral", address: "Vancouver, BC", rep: "Maria", priority: "high", close_date: day(30), created_at: ago(8 * D), stage_at: ago(1 * D) }),
      deal({ id: "d4", title: "Membership growth plan · Becker Fitness", stage: "quoted", contact_id: "c4", value: 42000, project: "Upgrade", budget: "", source: "Facebook / Instagram", address: "Calgary, AB", rep: "Maria", priority: "medium", close_date: day(9), created_at: ago(14 * D), stage_at: ago(6 * D), quote_sent_at: ago(6 * D) }),
      deal({ id: "d8", title: "Annual renewal · Park & Co. Realty", stage: "negotiation", contact_id: "c5", value: 18000, project: "Renewal", budget: "", source: "Repeat customer", address: "New York, NY", rep: "Dan", priority: "low", close_date: day(-3), created_at: ago(20 * D), stage_at: ago(4 * D) }),
      deal({ id: "d5", title: "Website and booking page · Park & Co.", stage: "won", contact_id: "c5", value: 28500, project: "New customer", budget: "", source: "Google Ads", address: "New York, NY", rep: "Dan", close_date: day(-9), created_at: ago(30 * D), stage_at: ago(9 * D) }),
      deal({ id: "d6", title: "Sales pipeline rebuild · Webb Consulting", stage: "lost", contact_id: "c6", value: 64000, project: "Consulting", budget: "", source: "Event", address: "London, UK", rep: "Dan", lost_reason: "Price too high", created_at: ago(40 * D), stage_at: ago(20 * D) }),
      deal({ id: "d7", title: "Client retention program · Johnson Spa", stage: "won", contact_id: "c7", value: 15200, project: "Upgrade", budget: "", source: "Referral", address: "Dublin, IE", rep: "Maria", close_date: day(-2), created_at: ago(50 * D), stage_at: ago(2 * D) }),
      deal({ id: "d9", title: "Onboarding package · Collins Dental", stage: "won", contact_id: "c1", value: 9800, project: "New customer", budget: "", source: "Referral", address: "", rep: "Maria", created_at: ago(150 * D), stage_at: ago(138 * D) }),
      deal({ id: "d10", title: "Email marketing setup · Okafor Physio", stage: "won", contact_id: "c2", value: 6400, project: "New customer", budget: "", source: "Website form", address: "", rep: "Dan", created_at: ago(128 * D), stage_at: ago(110 * D) }),
      deal({ id: "d11", title: "Front desk automation · Nair Aesthetics", stage: "won", contact_id: "c3", value: 21500, project: "Upgrade", budget: "", source: "Google Ads", address: "", rep: "Maria", created_at: ago(112 * D), stage_at: ago(84 * D) }),
      deal({ id: "d12", title: "Loyalty program · Becker Fitness", stage: "won", contact_id: "c4", value: 13200, project: "Upgrade", budget: "", source: "Facebook / Instagram", address: "", rep: "Dan", created_at: ago(95 * D), stage_at: ago(71 * D) }),
      deal({ id: "d13", title: "Reporting dashboards · Webb Consulting", stage: "lost", contact_id: "c6", value: 17500, project: "Consulting", budget: "", source: "Event", address: "", rep: "Maria", lost_reason: "Went with a competitor", created_at: ago(90 * D), stage_at: ago(66 * D) }),
      deal({ id: "d14", title: "Listing follow-up system · Park & Co.", stage: "won", contact_id: "c5", value: 24800, project: "New customer", budget: "", source: "Google Ads", address: "", rep: "Dan", created_at: ago(70 * D), stage_at: ago(48 * D) }),
      deal({ id: "d15", title: "Review and referral engine · Johnson Spa", stage: "won", contact_id: "c7", value: 11900, project: "Upgrade", budget: "", source: "Referral", address: "", rep: "Maria", created_at: ago(64 * D), stage_at: ago(37 * D) }),
    ],
    visits: [
      { id: "v2", deal_id: "d2", contact_id: "c2", rep: "Dan", starts_at: ahead(30 * H), status: "scheduled", priority: "", result: "", created_at: ago(2 * D) },
      { id: "v3", deal_id: "d3", contact_id: "c3", rep: "Maria", starts_at: ago(1 * D + 2 * H), status: "done", priority: "hot", result: "Wants automated reminders and online booking. Decision maker is Priya, budget approved for Q1.", created_at: ago(5 * D) },
      { id: "v4", deal_id: "d4", contact_id: "c4", rep: "Maria", starts_at: ago(9 * D), status: "done", priority: "warm", result: "Three locations, needs member onboarding emails and a win-back journey. Wants to start next month.", created_at: ago(12 * D) },
    ],
    autolog: [
      { id: "l1", deal_id: "d4", kind: "Quote", message: "Quote for $42,000 sent to Tom Becker", tone: "info", key: "quote:d4", created_at: ago(6 * D) },
      { id: "l2", deal_id: "d4", kind: "Quote", message: "Day-2 quote follow-up sent", tone: "info", key: "q2:d4", created_at: ago(4 * D) },
      { id: "l3", deal_id: "d4", kind: "Quote", message: "Day-5 quote follow-up sent", tone: "info", key: "q5:d4", created_at: ago(1 * D) },
      { id: "l4", deal_id: "d5", kind: "Won", message: "Contract signed · Closed Won $28,500", tone: "won", key: "won:d5", created_at: ago(9 * D) },
      { id: "l5", deal_id: "d1", kind: "Lead", message: "New lead from Google Ads: Sarah Collins, Collins Dental Studio", tone: "info", key: "lead:d1", created_at: ago(10 * M) },
      { id: "l6", deal_id: "d1", kind: "Routing", message: "Duplicate check passed · assigned to Maria by round robin", tone: "info", key: "route:d1", created_at: ago(10 * M) },
      { id: "l7", deal_id: "d1", kind: "Auto", message: "Speed-to-lead email sent in 38 seconds", tone: "info", key: "speed:d1", created_at: ago(9 * M) },
      { id: "l8", deal_id: "d1", kind: "Task", message: "Call task created for Maria, due in 15 min", tone: "info", key: "calltask:d1", created_at: ago(9 * M) },
      { id: "l9", deal_id: "d7", kind: "Review", message: "Review request sent to Ava Johnson", tone: "info", key: "review:d7", created_at: ago(2 * D) },
      { id: "l10", deal_id: "d6", kind: "Lost", message: "Marked lost: Price too high · moved to 90-day nurture", tone: "warn", key: "lost:d6", created_at: ago(20 * D) },
    ],
    tasks: [
      { id: "t1", title: "Call Sarah Collins back (new Google Ads lead)", due_date: null, done: false, contact_id: "c1", deal_id: "d1", created_at: ago(9 * M) },
      { id: "t2", title: "Send Priya the proposal for marketing automation", due_date: null, done: false, contact_id: "c3", deal_id: "d3", created_at: ago(1 * D) },
    ],
    activities: [
      { id: "a1", contact_id: "c4", kind: "call", body: "Tom wants to compare with one other provider. Asked about financing options.", created_at: ago(4 * D) },
      { id: "a2", contact_id: "c3", kind: "note", body: "Priya prefers text over calls. Best time is after 5pm.", created_at: ago(6 * D) },
    ],
    templates: [
      { id: "tp1", name: "Quick follow-up", subject: "Following up, {{first_name}}", body: "Hi {{first_name}},\n\nJust checking in to see if you had any questions about your project. Happy to jump on a quick call whenever suits you.\n\nBest,", created_at: ago(10 * D) },
    ],
    campaigns: [],
    emails: [],
    segments: [],
    forms: [],
    form_submissions: [],
    services: [
      { id: "sv1", name: "Free consultation", kind: "appointment", duration: 30, price: 0, capacity: 1, color: "#0b8a8a", description: "A friendly first chat about your goals.", staff: [], schedule: [], active: true, created_at: ago(20 * D) },
      { id: "sv2", name: "Personal training", kind: "appointment", duration: 60, price: 80, capacity: 1, color: "#5a5bef", description: "One-to-one session with a coach.", staff: [], schedule: [], active: true, created_at: ago(20 * D) },
      { id: "sv3", name: "Strength class", kind: "class", duration: 50, price: 25, capacity: 12, color: "#ec5b7f", description: "Small-group strength training. All levels.", staff: [], schedule: [{ day: 1, time: "18:00", staff: "" }, { day: 3, time: "18:00", staff: "" }], active: true, created_at: ago(20 * D) },
      { id: "sv4", name: "Mobility", kind: "class", duration: 45, price: 20, capacity: 10, color: "#ffad4d", description: "Stretch, breathe and move better.", staff: [], schedule: [{ day: 2, time: "07:00", staff: "" }, { day: 4, time: "07:00", staff: "" }, { day: 6, time: "09:00", staff: "" }], active: true, created_at: ago(20 * D) },
    ],
    bookings: [
      { id: "bk1", service_id: "sv2", contact_id: "c2", staff: "", starts_at: at(1, 10), ends_at: at(1, 11), status: "booked", source: "online", membership_id: null, note: "", created_at: ago(2 * H) },
      { id: "bk2", service_id: "sv1", contact_id: "c3", staff: "", starts_at: at(2, 14), ends_at: at(2, 14, 30), status: "booked", source: "staff", membership_id: null, note: "", created_at: ago(5 * H) },
    ],
    plans: [
      { id: "pl1", name: "10-class pack", kind: "pack", price: 180, sessions: 10, months: 6, active: true, created_at: ago(30 * D) },
      { id: "pl2", name: "Unlimited monthly", kind: "unlimited", price: 129, sessions: 0, months: 1, active: true, created_at: ago(30 * D) },
    ],
    org_members: [
      { id: "m1", org_id: "demo", user_id: "u1", email: "maria@northstar.example", name: "Maria", role: "manager", status: "active", own_only: false, created_at: ago(60 * D) },
      { id: "m2", org_id: "demo", user_id: "u2", email: "dan@northstar.example", name: "Dan", role: "rep", status: "active", own_only: true, created_at: ago(45 * D) },
      { id: "m3", org_id: "demo", user_id: null, email: "aisha@northstar.example", name: "Aisha", role: "rep", status: "invited", own_only: false, created_at: ago(1 * D) },
    ],
    objects: [
      { id: "ob1", name: "Consultation", plural: "Consultations", icon: "calendar", color: "#5a5bef", link_contact: true, link_deal: true, created_at: ago(20 * D),
        statuses: ["Requested", "Scheduled", "Completed", "No-show", "Cancelled"],
        fields: [{ key: "date", label: "Date and time", type: "datetime", required: true }, { key: "type", label: "Consultation type", type: "select", options: ["In person", "Video call", "Phone"] }, { key: "concern", label: "Main concern", type: "textarea" }, { key: "fee", label: "Fee", type: "currency" }] },
      { id: "ob2", name: "Class booking", plural: "Class bookings", icon: "users", color: "#ec5b7f", link_contact: true, link_deal: false, created_at: ago(15 * D),
        statuses: ["Booked", "Attended", "No-show", "Cancelled"],
        fields: [{ key: "class", label: "Class", type: "select", options: ["Strength", "Mobility", "HIIT", "Yoga"], required: true }, { key: "date", label: "Class date", type: "date", required: true }, { key: "trial", label: "Free trial", type: "checkbox" }] },
    ],
    suppressions: [
      { id: "sp1", email: "old-list@example.com", reason: "Imported suppression list", created_at: ago(30 * D) },
      { id: "sp2", email: "competitor@example.com", reason: "Competitor", created_at: ago(10 * D) },
    ],
    data_extensions: [
      { id: "de1", name: "Appointments", external_key: "appointments", description: "Upcoming and past appointments, one row per visit.", folder: "Operations", sendable: true, link: { field: "Email", to: "email" }, created_at: ago(20 * D),
        fields: [{ name: "AppointmentId", type: "text", length: 20, primary: true, required: true }, { name: "Email", type: "email", required: true }, { name: "FirstName", type: "text", length: 50 }, { name: "Service", type: "text", length: 80 }, { name: "AppointmentDate", type: "date" }, { name: "Amount", type: "decimal" }, { name: "Confirmed", type: "boolean", default: "false" }] },
      { id: "de2", name: "Newsletter sign-ups", external_key: "newsletter_signups", description: "People who joined the newsletter from the website.", folder: "Marketing", sendable: true, link: { field: "Email", to: "email" }, created_at: ago(12 * D),
        fields: [{ name: "Email", type: "email", primary: true, required: true }, { name: "FirstName", type: "text", length: 50 }, { name: "City", type: "text", length: 50 }, { name: "SignupDate", type: "date" }, { name: "Interest", type: "text", length: 50 }] },
    ],
    de_rows: [
      ...([["A-1001", "priya@nair.example", "Priya", "Free consultation", 2, "0", "true"], ["A-1002", "tom@becker.example", "Tom", "Strength class", 1, "25", "true"], ["A-1003", "james@okafor.example", "James", "Personal training", 1, "90", "false"], ["A-1004", "sarah@collins.example", "Sarah", "Discovery consultation", 5, "0", "false"], ["A-0990", "ava@johnson.example", "Ava", "Wellness review", -9, "120", "true"], ["A-0985", "linda@park.example", "Linda", "Strategy session", -14, "250", "true"]] as const)
        .map(([id, email, first, service, d, amount, ok], i) => ({ id: `dr${i + 1}`, de_id: "de1", data: { AppointmentId: id, Email: email, FirstName: first, Service: service, AppointmentDate: day(d), Amount: amount, Confirmed: ok }, created_at: ago((6 - i) * D) })),
      ...([["mia@example.com", "Mia", "Toronto", "Fitness"], ["noah@example.com", "Noah", "Vancouver", "Wellness"], ["priya@nair.example", "Priya", "Toronto", "Skincare"], ["leo@example.com", "Leo", "Calgary", "Fitness"], ["zoe@example.com", "Zoe", "Ottawa", "Nutrition"]] as const)
        .map(([email, first, city, interest], i) => ({ id: `dn${i + 1}`, de_id: "de2", data: { Email: email, FirstName: first, City: city, SignupDate: day(-i * 2 - 1), Interest: interest }, created_at: ago((i * 2 + 1) * D) })),
    ],
    messages: [
      { id: "mg1", contact_id: "c3", channel: "whatsapp", direction: "out", phone: "+14165550113", body: "Hi Priya, thanks for your interest in Northstar Studio. Would Thursday at 2pm work for your free consultation?", template: "consultation_invite", status: "delivered", error: "", provider_id: "", read: true, created_at: ago(2 * D) },
      { id: "mg2", contact_id: "c3", channel: "whatsapp", direction: "in", phone: "+14165550113", body: "Thursday works. Can we do 2:30 instead?", template: "", status: "received", error: "", provider_id: "", read: true, created_at: ago(2 * D - 20 * 60000) },
      { id: "mg3", contact_id: "c3", channel: "whatsapp", direction: "out", phone: "+14165550113", body: "2:30 is perfect. You're booked. See you then!", template: "", status: "delivered", error: "", provider_id: "", read: true, created_at: ago(2 * D - 30 * 60000) },
      { id: "mg4", contact_id: "c3", channel: "whatsapp", direction: "in", phone: "+14165550113", body: "Great, thank you. Do I need to bring anything?", template: "", status: "received", error: "", provider_id: "", read: false, created_at: ago(3 * H) },
      { id: "mg5", contact_id: "c4", channel: "sms", direction: "out", phone: "+14165550114", body: "Hi Tom, your Strength class is tomorrow at 6pm. Reply C to confirm or R to reschedule.", template: "", status: "delivered", error: "", provider_id: "", read: true, created_at: ago(1 * D) },
      { id: "mg6", contact_id: "c4", channel: "sms", direction: "in", phone: "+14165550114", body: "C", template: "", status: "received", error: "", provider_id: "", read: true, created_at: ago(1 * D - 5 * 60000) },
      { id: "mg7", contact_id: "c1", channel: "sms", direction: "out", phone: "+14165550111", body: "Hi Sarah, it's Maria from Northstar Studio. I got your request and will call you this afternoon.", template: "", status: "delivered", error: "", provider_id: "", read: true, created_at: ago(9 * 60000) },
      { id: "mg8", contact_id: "c2", channel: "sms", direction: "out", phone: "+14165550112", body: "Hi James, a reminder about your session on Wednesday at 10am.", template: "", status: "delivered", error: "", provider_id: "", read: true, created_at: ago(5 * H) },
      { id: "mg9", contact_id: "c5", channel: "sms", direction: "in", phone: "+14165550115", body: "Hi, can someone send me the renewal quote again?", template: "", status: "received", error: "", provider_id: "", read: false, created_at: ago(40 * 60000) },
    ],
    records: [
      { id: "r1", object_id: "ob1", contact_id: "c3", deal_id: "d3", title: "Initial consultation", status: "Scheduled", assigned_to: "Maria", data: { date: at(2, 11).slice(0, 16), type: "Video call", concern: "Wants automated reminders and online booking.", fee: "0" }, created_at: ago(3 * D) },
      { id: "r2", object_id: "ob1", contact_id: "c1", deal_id: "d1", title: "Discovery consultation", status: "Requested", assigned_to: "", data: { type: "Phone" }, created_at: ago(1 * H) },
      { id: "r3", object_id: "ob2", contact_id: "c4", deal_id: null, title: "Strength class", status: "Attended", assigned_to: "Dan", data: { class: "Strength", date: ago(2 * D).slice(0, 10), trial: "Yes" }, created_at: ago(4 * D) },
    ],
    memberships: [
      { id: "ms1", contact_id: "c4", plan_id: "pl1", status: "active", credits: 7, starts_on: ago(12 * D).slice(0, 10), ends_on: ahead(170 * D).slice(0, 10), created_at: ago(12 * D) },
    ],
    workflows: STARTERS.map((w) => ({ ...w, id: "wf-" + w.template_id, active: true, activated_at: new Date().toISOString(), created_at: new Date().toISOString() })),
    workflow_runs: [],
    settings: [
      { id: "s1", business_name: "Northstar Studio", sender_name: "Sam from Northstar", reply_to: "", address: "100 King St W, Toronto, ON", signature: "Sam\nNorthstar Studio", reps: ["Maria", "Dan"], owner_email: "", review_link: "https://g.page/r/your-review-link", booking_link: "", automations_off: [], rr_index: 1, timezone: "America/Toronto", starters_installed: true, intake_key: "demo-intake-key", stage_labels: {}, custom_fields: [], created_at: ago(30 * D) },
    ],
  };
}
