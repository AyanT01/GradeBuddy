import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { RoleGate } from "@/components/RoleGate";

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
            Onboarding
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Select your role</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Tell us how you plan to use GradeBuddy to personalize your dashboard.
          </p>
        </header>

        <SignedOut>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-300">
              Sign in to continue onboarding.
            </p>
            <div className="mt-4">
              <SignInButton>
                <button className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-900">
                  Sign in
                </button>
              </SignInButton>
            </div>
          </div>
        </SignedOut>

        <SignedIn>
          <RoleGate redirectTo="/dashboard" />
        </SignedIn>
      </main>
    </div>
  );
}
