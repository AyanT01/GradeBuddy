"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useDropzone } from "react-dropzone";
import { apiFetch, ApiError } from "@/lib/api";

type PresignedResponse = {
  upload_url: string;
  file_key: string;
};

type UploadCompleteResponse = {
  submission_id: number;
};

type UploadPanelProps = {
  assignmentId: string;
  onAssignmentIdChange: (value: string) => void;
};

export function UploadPanel({ assignmentId, onAssignmentIdChange }: UploadPanelProps) {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!assignmentId.trim()) {
        setStatus("Please enter an assignment ID before uploading.");
        return;
      }
      const file = acceptedFiles[0];
      if (!file) {
        return;
      }

      try {
        setStatus("Requesting upload URL...");
        const token = await getToken();
        const presigned = await apiFetch<PresignedResponse>(
          "/upload/presigned-url",
          token,
          {
            method: "POST",
            body: {
              filename: file.name,
              file_type: file.type || "application/pdf",
              assignment_id: Number(assignmentId),
            },
          }
        );

        setStatus("Uploading to S3...");
        await fetch(presigned.upload_url, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/pdf",
          },
        });

        setStatus("Confirming upload...");
        const completed = await apiFetch<UploadCompleteResponse>(
          "/upload/complete",
          token,
          {
            method: "POST",
            body: {
              assignment_id: Number(assignmentId),
              file_key: presigned.file_key,
            },
          }
        );

        setStatus(`Upload complete. Submission #${completed.submission_id}`);
      } catch (err) {
        const apiError = err as ApiError;
        setStatus(apiError.detail || "Upload failed.");
      }
    },
    [assignmentId, getToken]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
  });

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-sm font-semibold">Submit assignment</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={assignmentId}
          onChange={(event) => onAssignmentIdChange(event.target.value)}
          placeholder="Assignment ID"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
        />
      </div>

      <div
        {...getRootProps()}
        className={`mt-4 cursor-pointer rounded-xl border border-dashed px-4 py-8 text-center text-sm ${
          isDragActive
            ? "border-white bg-white/10"
            : "border-zinc-700 text-zinc-300"
        }`}
      >
        <input {...getInputProps()} />
        <p>{isDragActive ? "Drop the PDF here" : "Drag & drop a PDF, or click"}</p>
      </div>

      {status ? <p className="mt-3 text-xs text-zinc-400">{status}</p> : null}
    </div>
  );
}
