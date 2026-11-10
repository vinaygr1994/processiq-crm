import Link from "next/link";
import { Logo } from "@/components/Logo";
export const metadata = { title: "Invite only" };
export default function Page() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-3xl border border-line bg-white p-7 text-center shadow-sm sm:p-9">
          <h1 className="text-[22px] font-semibold">This CRM is invite-only</h1>
          <p className="mt-2 text-muted">New accounts are added by the administrator. If you already have an account, log in below. If you need access, contact the person who shared this link.</p>
          <Link href="/login" className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 font-semibold text-white">Log in</Link>
        </div>
      </div>
    </main>
  );
}
