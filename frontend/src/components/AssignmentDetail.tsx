"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useDropzone } from "react-dropzone";
import { apiFetch, ApiError } from "@/lib/api";

type Role = "student" | "teacher";

type Assignment = {
  id: number;
  title: string;
  description: string | null;
  file_key: string | null;
  file_url: string | null;
  classroom_id: number;
  classroom_name: string | null;
};

type Submission = {
  id: number;
  student_id: number;
  student_email: string | null;
  file_key: string;
  file_url: string | null;
};

type SyncResponse = {
  id: number;
  role: Role;
};

type PresignedResponse = {
  upload_url: string;
  file_key: string;
};

type UploadCompleteResponse = {
  submission_id: number;
};

type AssignmentDetailProps = {
  assignmentId: number;
};

export function AssignmentDetail({ assignmentId }: AssignmentDetailProps) {
  const { getToken } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const token = await getToken();

        // Get user role
        const syncRes = await apiFetch<SyncResponse>("/auth/sync", token, {
          method: "POST",
          body: {},
        });
        setRole(syncRes.role);

        // Get assignment details
        const assignmentRes = await apiFetch<Assignment>(
          `/assignments/${assignmentId}`,
          token,
          { method: "GET" }
        );
        setAssignment(assignmentRes);

        // Get submissions
        const submissionsRes = await apiFetch<Submission[]>(
          `/assignments/${assignmentId}/submissions`,
          token,
          { method: "GET" }
        );
        setSubmissions(submissionsRes);
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError.detail || "Unable to load assignment");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [assignmentId, getToken]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      try {
        setUploadStatus("Requesting upload URL...");
        const token = await getToken();

        const presigned = await apiFetch<PresignedResponse>(
          "/upload/presigned-url",
          token,
          {
            method: "POST",
            body: {
              filename: file.name,
              file_type: file.type || "application/pdf",
              assignment_id: assignmentId,
              purpose: "submission",
            },
          }
        );

        setUploadStatus("Uploading to S3...");
        await fetch(presigned.upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/pdf" },
        });

        setUploadStatus("Confirming upload...");
        const completed = await apiFetch<UploadCompleteResponse>(
          "/upload/complete",
          token,
          {
            method: "POST",
            body: {
              assignment_id: assignmentId,
              file_key: presigned.file_key,
            },
          }
        );

        setUploadStatus(`✓ Uploaded! Submission #${completed.submission_id}`);

        // Reload submissions
        const submissionsRes = await apiFetch<Submission[]>(
          `/assignments/${assignmentId}/submissions`,
          token,
          { method: "GET" }
        );
        setSubmissions(submissionsRes);
      } catch (err) {
        const apiError = err as ApiError;
        setUploadStatus(apiError.detail || "Upload failed");
      }
    },
    [assignmentId, getToken]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
  });

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
        Loading assignment...
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-8 text-center text-red-200">
        {error || "Assignment not found"}
        <Link
          href="/dashboard"
          className="mt-4 block text-sm text-zinc-400 underline"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              Assignment
            </p>
            <h1 className="mt-2 text-2xl font-semibold">{assignment.title}</h1>
            {assignment.classroom_name && (
              <p className="mt-1 text-sm text-zinc-400">
                {assignment.classroom_name}
              </p>
            )}
          </div>
          <Link
            href={`/dashboard/classrooms/${assignment.classroom_id}`}
            className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500"
          >
            ← Back to class
          </Link>
        </div>

        {/* Description */}
        {assignment.description && (
          <div className="mt-6 rounded-xl bg-zinc-950 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Instructions
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">
              {assignment.description}
            </p>
          </div>
        )}

        {/* Teacher's attached file */}
        {assignment.file_url && (
          <div className="mt-4">
            <a
              href={assignment.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download Assignment PDF
            </a>
          </div>
        )}
      </div>

      {/* Student: Upload submission */}
      {role === "student" && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-semibold">Submit Your Work</h2>
          <div
            {...getRootProps()}
            className={`mt-4 cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
              isDragActive
                ? "border-white bg-white/10"
                : "border-zinc-700 hover:border-zinc-500"
            }`}
          >
            <input {...getInputProps()} />
            <svg
              className="mx-auto h-10 w-10 text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="mt-3 text-sm text-zinc-400">
              {isDragActive
                ? "Drop your PDF here"
                : "Drag & drop a PDF, or click to browse"}
            </p>
          </div>
          {uploadStatus && (
            <p className="mt-3 text-sm text-zinc-400">{uploadStatus}</p>
          )}
        </div>
      )}

      {/* Submissions list */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="text-lg font-semibold">
          {role === "teacher" ? "Student Submissions" : "Your Submissions"}
        </h2>

        {submissions.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            {role === "teacher"
              ? "No submissions yet"
              : "You haven't submitted anything yet"}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {submissions.map((submission) => (
              <div
                key={submission.id}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
              >
                <div>
                  {role === "teacher" && submission.student_email && (
                    <p className="text-sm font-medium">
                      {submission.student_email}
                    </p>
                  )}
                  <p className="text-xs text-zinc-500">
                    Submission #{submission.id}
                  </p>
                </div>
                {submission.file_url && (
                  <a
                    href={submission.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
                  >
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
