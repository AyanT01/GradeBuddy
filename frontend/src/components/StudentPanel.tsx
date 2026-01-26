"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetch, ApiError } from "@/lib/api";

type Classroom = {
  id: number;
  name: string;
};

type ClassroomWithStats = {
  id: number;
  name: string;
  assignment_count: number;
  quiz_count: number;
  pending_count: number;
};

export function StudentPanel() {
  const { getToken } = useAuth();
  const [classes, setClasses] = useState<ClassroomWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClasses = async () => {
    try {
      const token = await getToken();
      const response = await apiFetch<Classroom[]>("/classrooms", token, {
        method: "GET",
      });

      // Get stats for each classroom
      const classesWithStats: ClassroomWithStats[] = await Promise.all(
        response.map(async (classroom) => {
          try {
            const [assignments, quizzes] = await Promise.all([
              apiFetch<{ id: number }[]>(
                `/classrooms/${classroom.id}/assignments`,
                token,
                { method: "GET" }
              ),
              apiFetch<{ id: number; attempt_status: string | null }[]>(
                `/classrooms/${classroom.id}/quizzes`,
                token,
                { method: "GET" }
              ).catch(() => []),
            ]);

            const pendingQuizzes = quizzes.filter(
              (q) => q.attempt_status !== "submitted"
            ).length;

            return {
              id: classroom.id,
              name: classroom.name,
              assignment_count: assignments.length,
              quiz_count: quizzes.length,
              pending_count: pendingQuizzes,
            };
          } catch {
            return {
              id: classroom.id,
              name: classroom.name,
              assignment_count: 0,
              quiz_count: 0,
              pending_count: 0,
            };
          }
        })
      );

      setClasses(classesWithStats);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to load classrooms.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, [getToken]);

  const handleJoin = async () => {
    if (!code.trim() || code.length !== 6) {
      setError("Enter a valid 6-digit join code.");
      return;
    }

    try {
      setJoining(true);
      setError(null);
      const token = await getToken();
      await apiFetch("/classrooms/join", token, {
        method: "POST",
        body: { code },
      });
      setCode("");
      setShowJoinForm(false);
      await loadClasses();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to join classroom.");
    } finally {
      setJoining(false);
    }
  };

  // Calculate totals
  const totalAssignments = classes.reduce((sum, c) => sum + c.assignment_count, 0);
  const totalQuizzes = classes.reduce((sum, c) => sum + c.quiz_count, 0);
  const totalPending = classes.reduce((sum, c) => sum + c.pending_count, 0);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500">
        Loading dashboard...
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My Classes" value={classes.length} icon="📚" />
        <StatCard label="Assignments" value={totalAssignments} icon="📝" />
        <StatCard label="Quizzes" value={totalQuizzes} icon="❓" />
        <StatCard
          label="Pending"
          value={totalPending}
          icon="⏳"
          highlight={totalPending > 0}
        />
      </div>

      {/* Header with + button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">My Classrooms</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Click a classroom to view assignments and quizzes
          </p>
        </div>
        <button
          onClick={() => setShowJoinForm(!showJoinForm)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-bold text-zinc-900 transition hover:bg-zinc-200"
          title="Join a classroom"
        >
          {showJoinForm ? "×" : "+"}
        </button>
      </div>

      {/* Join classroom form */}
      {showJoinForm && (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold">Join a Classroom</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Enter the 6-digit code from your teacher
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-center font-mono text-lg tracking-widest placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              autoFocus
            />
            <button
              onClick={handleJoin}
              disabled={joining || code.length !== 6}
              className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
            >
              {joining ? "Joining..." : "Join"}
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Classrooms grid */}
      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 py-12 text-center">
          <p className="text-zinc-400">No classrooms yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Click the + button to join your first classroom
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((classroom) => (
            <Link
              key={classroom.id}
              href={`/dashboard/classrooms/${classroom.id}`}
              className="group rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-zinc-600 hover:bg-zinc-900"
            >
              <h3 className="font-semibold group-hover:text-white">
                {classroom.name}
              </h3>

              {/* Classroom stats */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-zinc-950 px-2 py-2">
                  <p className="text-lg font-semibold">
                    {classroom.assignment_count}
                  </p>
                  <p className="text-xs text-zinc-500">Tasks</p>
                </div>
                <div className="rounded-lg bg-zinc-950 px-2 py-2">
                  <p className="text-lg font-semibold">{classroom.quiz_count}</p>
                  <p className="text-xs text-zinc-500">Quizzes</p>
                </div>
                <div className="rounded-lg bg-zinc-950 px-2 py-2">
                  <p
                    className={`text-lg font-semibold ${
                      classroom.pending_count > 0 ? "text-yellow-400" : ""
                    }`}
                  >
                    {classroom.pending_count}
                  </p>
                  <p className="text-xs text-zinc-500">Pending</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end text-xs">
                <span className="text-zinc-500 group-hover:text-zinc-400">
                  Open →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: number;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className={`text-2xl font-bold ${highlight ? "text-yellow-400" : ""}`}>
            {value}
          </p>
          <p className="text-xs text-zinc-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
