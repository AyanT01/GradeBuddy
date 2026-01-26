import { UserButton } from "@clerk/nextjs";
import { RoleGate } from "@/components/RoleGate";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              Dashboard
            </p>
            <h1 className="text-3xl font-semibold">Welcome to GradeBuddy</h1>
          </div>
          <UserButton />
        </header>

        <RoleGate />
      </main>
    </div>
  );
}
