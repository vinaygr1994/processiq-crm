# Process IQ CRM

A simple, browser-based CRM for small and medium businesses with built-in email and AI help.

**Today** (owner dashboard: leads, first-reply time, visits, quotes, revenue, lead-source report) · **Jobs** (Lead-to-Job board: New lead → Contacted → Visit booked → Visit done → Quote sent → Won → Job complete / Lost) · **Autopilot** (12 automations: speed-to-lead reply, round-robin assignment, call-back chase, visit confirmations and reminders, no-show rescue, quote follow-ups, stale-deal alerts, long-term nurture, review request, referral ask) · **Contacts** · **Email** (one-to-one, visual email builder with ready-made designs, live desktop/mobile preview, send-me-a-test, templates, campaigns with unsubscribe) · **AI** (draft emails, summaries, what to do today).

Built around the flow in the live demo at https://www.processiqautomation.com/demo. In demo mode, Autopilot has a "time travel" control so you can watch follow-ups fire. Phase 2: SMS, real Google/Outlook calendar sync, server-side scheduling (so time-based follow-ups run when nobody is logged in), public lead-capture form.

## Try it now (demo mode)

```bash
npm install
npm run dev     # http://localhost:3000
```

With no environment variables it runs in **demo mode**: sample data in your browser, no login, and no real emails.

## Go live

1. **Supabase** (database + login): create a free project → SQL Editor → run `supabase/schema.sql`. Authentication → URL Configuration: set Site URL to your app address.
2. **Resend** (email): create an account, verify your sending domain, create an API key.
3. **Anthropic** (AI): create an API key.
4. Add the variables from `.env.example` to Vercel (Project → Settings → Environment Variables) and redeploy.

Settings → Connections inside the app shows what is connected.

## Tech

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres + Auth + row-level security) · Resend · Anthropic API. Deploys to Vercel.

Security notes: every table is protected by row-level security (people only see their own rows); emails can only be sent to contacts in your own CRM; marketing emails always include your address and a signed one-click unsubscribe link; demo mode never sends real email.
