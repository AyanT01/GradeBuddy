import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-12 px-6 py-16">
        <header className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">GradeBuddy</p>
            <h1 className="text-4xl font-semibold">AI Grading Platform MVP</h1>
            <p className="max-w-xl text-base text-zinc-300">
              Teachers create classes and assignments. Students upload PDFs directly to S3.
            </p>
          </div>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-xl font-semibold">Teachers</h2>
            <p className="mt-2 text-sm text-zinc-300">
              Create classrooms, post assignments, and track submissions.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-xl font-semibold">Students</h2>
            <p className="mt-2 text-sm text-zinc-300">
              Join with a 6-digit code and upload PDFs with a single drop.
          </p>
        </div>
        </section>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <SignedOut>
            <SignInButton>
              <button className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="rounded-full border border-zinc-700 px-6 py-3 text-sm font-semibold">
                Create account
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900"
              href="/dashboard"
            >
              Go to dashboard
            </Link>
          </SignedIn>
        </div>
      </main>
    </div>
  );
}
