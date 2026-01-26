"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useDropzone } from "react-dropzone";
import { apiFetch, ApiError } from "@/lib/api";
import { UploadPanel } from "@/components/UploadPanel";

type Role = "student" | "teacher";

type SyncResponse = {
  id: number;
  role: Role;
};

type Classroom = {
  id: number;
  name: string;
  join_code?: string;
};

type Assignment = {
  id: number;
  title: string;
  description: string | null;
  file_key: string | null;
};

type PresignedResponse = {
  upload_url: string;
  file_key: string;
};

type Quiz = {
  id: number;
  title: string;
  description: string | null;
  is_published: boolean;
  question_count: number;
  attempt_status: string | null;
  attempt_score: number | null;
  attempt_max_score: number | null;
};

type ClassroomDetailProps = {
  classroomId: number;
};

export function ClassroomDetail({ classroomId }: ClassroomDetailProps) {
  const { getToken } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  
  // New assignment form
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // New quiz form
  const [showCreateQuiz, setShowCreateQuiz] = useState(false);
  const [quizTitle, setQuizTitle] = useState("");
  const [quizDescription, setQuizDescription] = useState("");
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentDescription, setAssignmentDescription] = useState("");
  const [assignmentFile, setAssignmentFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const tokenPromise = useMemo(() => getToken(), [getToken]);

  useEffect(() => {
    const loadRoleAndClassroom = async () => {
      try {
        const token = await tokenPromise;
        const response = await apiFetch<SyncResponse>("/auth/sync", token, {
          method: "POST",
          body: {},
        });
        setRole(response.role);

        const classes = await apiFetch<Classroom[]>("/classrooms", token, {
          method: "GET",
        });
        const match = classes.find((item) => item.id === classroomId) ?? null;
        
        if (!match) {
          // User doesn't have access to this classroom
          setStatus("You don't have access to this classroom. Please join using a class code.");
          return;
        }
        
        setClassroom(match);
      } catch (err) {
        const apiError = err as ApiError;
        setStatus(apiError.detail || "Unable to load classroom.");
      }
    };

    loadRoleAndClassroom();
  }, [classroomId, tokenPromise]);

  useEffect(() => {
    const loadAssignments = async () => {
      if (!role || !classroom) return;
      try {
        const token = await tokenPromise;
        const response = await apiFetch<Assignment[]>(
          `/classrooms/${classroomId}/assignments`,
          token,
          { method: "GET" }
        );
        setAssignments(response);
      } catch (err) {
        const apiError = err as ApiError;
        setStatus(apiError.detail || "Unable to load assignments.");
      }
    };

    loadAssignments();
  }, [classroomId, role, classroom, tokenPromise]);

  useEffect(() => {
    const loadQuizzes = async () => {
      if (!role || !classroom) return;
      try {
        const token = await tokenPromise;
        const response = await apiFetch<Quiz[]>(
          `/classrooms/${classroomId}/quizzes`,
          token,
          { method: "GET" }
        );
        setQuizzes(response);
      } catch (err) {
        // Quizzes might not exist yet, that's ok
      }
    };

    loadQuizzes();
  }, [classroomId, role, classroom, tokenPromise]);

  const onDropAssignmentFile = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setAssignmentFile(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropAssignmentFile,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
  });

  const handleCreateAssignment = async () => {
    if (!assignmentTitle.trim()) {
      setStatus("Assignment title is required.");
      return;
    }

    try {
      setCreating(true);
      setStatus(null);
      const token = await tokenPromise;

      let fileKey: string | null = null;

      // Upload file if provided
      if (assignmentFile) {
        setStatus("Uploading file...");
        const presigned = await apiFetch<PresignedResponse>(
          "/upload/presigned-url",
          token,
          {
            method: "POST",
            body: {
              filename: assignmentFile.name,
              file_type: assignmentFile.type || "application/pdf",
              purpose: "assignment",
            },
          }
        );

        await fetch(presigned.upload_url, {
          method: "PUT",
          body: assignmentFile,
          headers: { "Content-Type": assignmentFile.type || "application/pdf" },
        });

        fileKey = presigned.file_key;
      }

      setStatus("Creating assignment...");
      const assignment = await apiFetch<Assignment>("/assignments", token, {
        method: "POST",
        body: {
          classroom_id: classroomId,
          title: assignmentTitle,
          description: assignmentDescription || null,
          file_key: fileKey,
        },
      });

      setAssignments((prev) => [assignment, ...prev]);
      setAssignmentTitle("");
      setAssignmentDescription("");
      setAssignmentFile(null);
      setShowCreateForm(false);
      setStatus("Assignment created!");
    } catch (err) {
      const apiError = err as ApiError;
      setStatus(apiError.detail || "Unable to create assignment.");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateQuiz = async () => {
    if (!quizTitle.trim()) {
      setStatus("Quiz title is required.");
      return;
    }

    try {
      setCreatingQuiz(true);
      setStatus(null);
      const token = await tokenPromise;

      const quiz = await apiFetch<Quiz>("/quizzes", token, {
        method: "POST",
        body: {
          classroom_id: classroomId,
          title: quizTitle,
          description: quizDescription || null,
        },
      });

      setQuizzes((prev) => [quiz, ...prev]);
      setQuizTitle("");
      setQuizDescription("");
      setShowCreateQuiz(false);
      setStatus("Quiz created! Click to add questions.");
    } catch (err) {
      const apiError = err as ApiError;
      setStatus(apiError.detail || "Unable to create quiz.");
    } finally {
      setCreatingQuiz(false);
    }
  };

  if (!role) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-300">
        Loading classroom...
      </div>
    );
  }

  // Access denied - not a member of this classroom
  if (!classroom && status) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-8 text-center">
          <p className="text-lg font-semibold text-red-200">Access Denied</p>
          <p className="mt-2 text-sm text-red-300">{status}</p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-full bg-white px-6 py-2 text-sm font-semibold text-zinc-900"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {/* Classroom header */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              Classroom
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {classroom?.name ?? `Class ${classroomId}`}
            </h2>
            {classroom?.join_code && (
              <p className="mt-2 text-sm text-zinc-400">
                Join code:{" "}
                <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono">
                  {classroom.join_code}
                </span>
              </p>
            )}
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      {status && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            status.includes("created") || status.includes("!")
              ? "border border-green-900/50 bg-green-950/30 text-green-200"
              : "border border-zinc-700 bg-zinc-900 text-zinc-300"
          }`}
        >
          {status}
        </div>
      )}

      {/* Assignments section */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Assignments</h3>
          {role === "teacher" && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-bold text-zinc-900 transition hover:bg-zinc-200"
            >
              {showCreateForm ? "×" : "+"}
            </button>
          )}
        </div>

        {/* Create assignment form (teachers only) */}
        {role === "teacher" && showCreateForm && (
          <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400">Title *</label>
                <input
                  value={assignmentTitle}
                  onChange={(e) => setAssignmentTitle(e.target.value)}
                  placeholder="e.g. Chapter 5 Homework"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400">
                  Description (optional)
                </label>
                <textarea
                  value={assignmentDescription}
                  onChange={(e) => setAssignmentDescription(e.target.value)}
                  placeholder="Instructions for students..."
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400">
                  Attachment (optional)
                </label>
                <div
                  {...getRootProps()}
                  className={`mt-1 cursor-pointer rounded-lg border border-dashed px-4 py-4 text-center text-sm transition ${
                    isDragActive
                      ? "border-white bg-white/10"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  <input {...getInputProps()} />
                  {assignmentFile ? (
                    <p className="text-zinc-300">📄 {assignmentFile.name}</p>
                  ) : (
                    <p className="text-zinc-500">
                      Drop a PDF here or click to upload
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={handleCreateAssignment}
                disabled={creating}
                className="w-full rounded-full bg-white py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Assignment"}
              </button>
            </div>
          </div>
        )}

        {/* Assignments list */}
        <div className="mt-4 space-y-2">
          {assignments.map((assignment) => (
            <Link
              key={assignment.id}
              href={`/dashboard/assignments/${assignment.id}`}
              className="group flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 transition hover:border-zinc-600"
            >
              <div>
                <p className="font-medium group-hover:text-white">
                  {assignment.title}
                </p>
                {assignment.description && (
                  <p className="mt-0.5 text-xs text-zinc-500 line-clamp-1">
                    {assignment.description}
                  </p>
                )}
              </div>
              <span className="text-xs text-zinc-500 group-hover:text-zinc-400">
                View →
              </span>
            </Link>
          ))}
          {assignments.length === 0 && (
            <p className="py-4 text-center text-sm text-zinc-500">
              No assignments yet
            </p>
          )}
        </div>
      </div>

      {/* Quizzes section */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Quizzes</h3>
          {role === "teacher" && (
            <button
              onClick={() => setShowCreateQuiz(!showCreateQuiz)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-bold text-zinc-900 transition hover:bg-zinc-200"
            >
              {showCreateQuiz ? "×" : "+"}
            </button>
          )}
        </div>

        {/* Create quiz form (teachers only) */}
        {role === "teacher" && showCreateQuiz && (
          <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400">Title *</label>
                <input
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  placeholder="e.g. Chapter 5 Quiz"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400">
                  Description (optional)
                </label>
                <textarea
                  value={quizDescription}
                  onChange={(e) => setQuizDescription(e.target.value)}
                  placeholder="Brief description..."
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <button
                onClick={handleCreateQuiz}
                disabled={creatingQuiz}
                className="w-full rounded-full bg-white py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
              >
                {creatingQuiz ? "Creating..." : "Create Quiz"}
              </button>
            </div>
          </div>
        )}

        {/* Quizzes list */}
        <div className="mt-4 space-y-2">
          {quizzes.map((quiz) => (
            <Link
              key={quiz.id}
              href={`/dashboard/quizzes/${quiz.id}`}
              className="group flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 transition hover:border-zinc-600"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium group-hover:text-white">
                    {quiz.title}
                  </p>
                  {!quiz.is_published && role === "teacher" && (
                    <span className="rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-300">
                      Draft
                    </span>
                  )}
                  {quiz.attempt_status === "submitted" && (
                    <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-xs text-green-300">
                      {quiz.attempt_score}/{quiz.attempt_max_score}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {quiz.question_count} question{quiz.question_count !== 1 ? "s" : ""}
                </p>
              </div>
              <span className="text-xs text-zinc-500 group-hover:text-zinc-400">
                {role === "teacher" ? "Edit →" : quiz.attempt_status === "submitted" ? "View →" : "Take →"}
              </span>
            </Link>
          ))}
          {quizzes.length === 0 && (
            <p className="py-4 text-center text-sm text-zinc-500">
              No quizzes yet
            </p>
          )}
        </div>
      </div>

      {/* Student: Quick submit section */}
      {role === "student" && assignments.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h3 className="text-lg font-semibold">Quick Submit</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Or click on an assignment above to view details and submit
          </p>
          <div className="mt-4">
            <label className="text-xs text-zinc-400">Select Assignment</label>
            <select
              value={selectedAssignmentId}
              onChange={(e) => setSelectedAssignmentId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Choose...</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
          {selectedAssignmentId && (
            <div className="mt-4">
              <UploadPanel
                assignmentId={selectedAssignmentId}
                onAssignmentIdChange={setSelectedAssignmentId}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
