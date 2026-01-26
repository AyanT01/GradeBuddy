"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetch, ApiError } from "@/lib/api";

type ClassroomStats = {
  id: number;
  name: string;
  join_code: string;
  student_count: number;
  assignment_count: number;
  submission_count: number;
  submission_rate: number;
};

type Analytics = {
  total_classrooms: number;
  total_students: number;
  total_assignments: number;
  total_submissions: number;
  classrooms: ClassroomStats[];
};

type ClassroomResponse = {
  id: number;
  name: string;
  join_code: string;
};

export function TeacherPanel() {
  const { getToken } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    try {
      const token = await getToken();
      const response = await apiFetch<Analytics>(
        "/analytics/teacher",
        token,
        { method: "GET" }
      );
      setAnalytics(response);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [getToken]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Class name is required.");
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const token = await getToken();
      await apiFetch<ClassroomResponse>("/classrooms", token, {
        method: "POST",
        body: { name },
      });
      setName("");
      setShowCreateForm(false);
      // Reload analytics to include new classroom
      await loadAnalytics();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to create classroom.");
    } finally {
      setCreating(false);
    }
  };

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
      {analytics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Classes"
            value={analytics.total_classrooms}
            icon="📚"
          />
          <StatCard
            label="Total Students"
            value={analytics.total_students}
            icon="👥"
          />
          <StatCard
            label="Assignments"
            value={analytics.total_assignments}
            icon="📝"
          />
          <StatCard
            label="Submissions"
            value={analytics.total_submissions}
            icon="✅"
          />
        </div>
      )}

      {/* Header with + button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Your Classrooms</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Manage your classes and view student progress
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-bold text-zinc-900 transition hover:bg-zinc-200"
          title="Create new classroom"
        >
          {showCreateForm ? "×" : "+"}
        </button>
      </div>

      {/* Create classroom form */}
      {showCreateForm && (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold">New Classroom</h3>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Biology 101"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
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
      {!analytics || analytics.classrooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 py-12 text-center">
          <p className="text-zinc-400">No classrooms yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Click the + button to create your first classroom
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {analytics.classrooms.map((classroom) => (
            <Link
              key={classroom.id}
              href={`/dashboard/classrooms/${classroom.id}`}
              className="group rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-zinc-600 hover:bg-zinc-900"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold group-hover:text-white">
                  {classroom.name}
                </h3>
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 font-mono text-xs text-zinc-400">
                  {classroom.join_code}
                </span>
              </div>

              {/* Classroom stats */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-zinc-950 px-2 py-2">
                  <p className="text-lg font-semibold">{classroom.student_count}</p>
                  <p className="text-xs text-zinc-500">Students</p>
                </div>
                <div className="rounded-lg bg-zinc-950 px-2 py-2">
                  <p className="text-lg font-semibold">{classroom.assignment_count}</p>
                  <p className="text-xs text-zinc-500">Tasks</p>
                </div>
                <div className="rounded-lg bg-zinc-950 px-2 py-2">
                  <p className="text-lg font-semibold">{classroom.submission_rate}%</p>
                  <p className="text-xs text-zinc-500">Done</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-zinc-500">
                  {classroom.submission_count} submission{classroom.submission_count !== 1 ? "s" : ""}
                </span>
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
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-zinc-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
