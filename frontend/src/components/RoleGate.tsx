"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { apiFetch, ApiError } from "@/lib/api";

import { StudentPanel } from "@/components/StudentPanel";
import { TeacherPanel } from "@/components/TeacherPanel";

type Role = "student" | "teacher";

type SyncResponse = {
  id: number;
  clerk_id: string;
  email: string;
  role: Role;
};

type RoleGateProps = {
  redirectTo?: string;
};

export function RoleGate({ redirectTo }: RoleGateProps) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenPromise = useMemo(() => {
    if (!isLoaded) {
      return null;
    }
    return getToken();
  }, [isLoaded, getToken]);

  useEffect(() => {
    let isMounted = true;
    const sync = async () => {
      if (!tokenPromise || !isSignedIn) {
        setRole(null);
        setShowRolePicker(false);
        return;
      }
      setIsSyncing(true);
      setError(null);

      try {
        const token = await tokenPromise;
        const response = await apiFetch<SyncResponse>("/auth/sync", token, {
          method: "POST",
          body: {},
        });
        if (!isMounted) {
          return;
        }
        setRole(response.role);
        setShowRolePicker(false);
        if (redirectTo && response.role) {
          router.push(redirectTo);
        }
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.status === 400) {
          setShowRolePicker(true);
        } else {
          setError(apiError.detail || "Unable to sync profile");
        }
      } finally {
        if (isMounted) {
          setIsSyncing(false);
        }
      }
    };

    sync();

    return () => {
      isMounted = false;
    };
  }, [tokenPromise, isSignedIn, redirectTo, router]);

  const handleRoleSelect = async (selectedRole: Role) => {
    if (!tokenPromise || !isSignedIn) {
      return;
    }
    setIsSyncing(true);
    setError(null);

    try {
      const token = await tokenPromise;
      const response = await apiFetch<SyncResponse>("/auth/sync", token, {
        method: "POST",
        body: { role: selectedRole },
      });
      setRole(response.role);
      setShowRolePicker(false);
      if (redirectTo) {
        router.push(redirectTo);
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to save role");
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isLoaded) {
    return <p className="text-sm text-zinc-400">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      {!isSignedIn ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="text-lg font-semibold">Sign in to continue</h3>
          <p className="mt-2 text-sm text-zinc-400">
            You need to be signed in to load your dashboard.
          </p>
          <div className="mt-4">
            <SignInButton>
              <button className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-900">
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      ) : null}
      {isSyncing ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
          Syncing your profile...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {showRolePicker ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="text-lg font-semibold">Select your role</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Choose how you will use GradeBuddy. You can change this later.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-900"
              onClick={() => handleRoleSelect("teacher")}
              disabled={isSyncing}
            >
              I am a teacher
            </button>
            <button
              className="rounded-full border border-zinc-700 px-5 py-2 text-sm font-semibold"
              onClick={() => handleRoleSelect("student")}
              disabled={isSyncing}
            >
              I am a student
            </button>
          </div>
        </div>
      ) : null}

      {!role && !showRolePicker && !error && !isSyncing ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
          Waiting for role assignment...
        </div>
      ) : null}

      {isSignedIn && role === "teacher" ? <TeacherPanel /> : null}
      {isSignedIn && role === "student" ? <StudentPanel /> : null}
    </div>
  );
}
