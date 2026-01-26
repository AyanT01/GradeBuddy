"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetch, ApiError } from "@/lib/api";

type StudentResult = {
  attempt_id: number;
  student_email: string | null;
  status: string;
  score: number | null;
  max_score: number | null;
  percentage: number;
  submitted_at: string | null;
};

type QuizResultsData = {
  quiz_title: string;
  total_attempts: number;
  submitted_count: number;
  average_percentage: number;
  results: StudentResult[];
};

type Answer = {
  id: number;
  question_id: number;
  question_text: string | null;
  question_type: string | null;
  max_points: number;
  selected_option_text: string | null;
  text_answer: string | null;
  correct_answer: string | null;
  is_correct: boolean | null;
  points_earned: number;
};

type QuizResultsProps = {
  quizId: number;
};

export function QuizResults({ quizId }: QuizResultsProps) {
  const { getToken } = useAuth();
  const [data, setData] = useState<QuizResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Grading modal state
  const [selectedAttempt, setSelectedAttempt] = useState<number | null>(null);
  const [attemptAnswers, setAttemptAnswers] = useState<Answer[]>([]);
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const [gradingAnswer, setGradingAnswer] = useState<number | null>(null);

  const loadResults = async () => {
    try {
      const token = await getToken();
      const res = await apiFetch<QuizResultsData>(
        `/quizzes/${quizId}/results`,
        token,
        { method: "GET" }
      );
      setData(res);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to load results");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, [getToken, quizId]);

  const loadAttemptAnswers = async (attemptId: number) => {
    setSelectedAttempt(attemptId);
    setLoadingAnswers(true);
    try {
      const token = await getToken();
      const res = await apiFetch<Answer[]>(
        `/attempts/${attemptId}/answers`,
        token,
        { method: "GET" }
      );
      setAttemptAnswers(res);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to load answers");
    } finally {
      setLoadingAnswers(false);
    }
  };

  const handleGrade = async (
    answerId: number,
    isCorrect: boolean,
    pointsEarned: number
  ) => {
    setGradingAnswer(answerId);
    try {
      const token = await getToken();
      await apiFetch(`/answers/${answerId}/grade`, token, {
        method: "PUT",
        body: { is_correct: isCorrect, points_earned: pointsEarned },
      });

      // Update local state
      setAttemptAnswers((prev) =>
        prev.map((ans) =>
          ans.id === answerId
            ? { ...ans, is_correct: isCorrect, points_earned: pointsEarned }
            : ans
        )
      );

      // Reload results to update scores
      await loadResults();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to grade answer");
    } finally {
      setGradingAnswer(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
        Loading results...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-8 text-center text-red-200">
        {error || "Unable to load results"}
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
        <Link
          href={`/dashboard/quizzes/${quizId}`}
          className="text-sm text-zinc-400 hover:text-zinc-300"
        >
          ← Back to quiz
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{data.quiz_title}</h1>
        <p className="mt-1 text-sm text-zinc-400">Student Results</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center">
          <p className="text-3xl font-bold">{data.submitted_count}</p>
          <p className="text-xs text-zinc-500">Submissions</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center">
          <p className="text-3xl font-bold">{data.average_percentage}%</p>
          <p className="text-xs text-zinc-500">Class Average</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center">
          <p className="text-3xl font-bold">{data.total_attempts}</p>
          <p className="text-xs text-zinc-500">Total Attempts</p>
        </div>
      </div>

      {/* Results table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="px-6 py-3 font-medium">Student</th>
              <th className="px-6 py-3 font-medium">Score</th>
              <th className="px-6 py-3 font-medium">Percentage</th>
              <th className="px-6 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.results.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                  No submissions yet
                </td>
              </tr>
            ) : (
              data.results.map((result) => (
                <tr
                  key={result.attempt_id}
                  className="border-b border-zinc-800/50 last:border-0"
                >
                  <td className="px-6 py-4 text-sm">
                    {result.student_email || "Unknown"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {result.score !== null
                      ? `${result.score}/${result.max_score}`
                      : "-"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full bg-white"
                          style={{ width: `${result.percentage}%` }}
                        />
                      </div>
                      <span className="text-sm">{result.percentage}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => loadAttemptAnswers(result.attempt_id)}
                      className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
                    >
                      {selectedAttempt === result.attempt_id
                        ? "Hide"
                        : "Review & Grade"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Grading panel */}
      {selectedAttempt && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Review Answers</h2>
            <button
              onClick={() => {
                setSelectedAttempt(null);
                setAttemptAnswers([]);
              }}
              className="text-sm text-zinc-400 hover:text-zinc-300"
            >
              Close
            </button>
          </div>

          {loadingAnswers ? (
            <p className="mt-4 text-sm text-zinc-500">Loading answers...</p>
          ) : (
            <div className="mt-4 space-y-4">
              {attemptAnswers.map((answer, idx) => (
                <div
                  key={answer.id}
                  className={`rounded-xl border p-4 ${
                    answer.is_correct === null
                      ? "border-yellow-900/50 bg-yellow-950/20"
                      : answer.is_correct
                      ? "border-green-900/50 bg-green-950/20"
                      : "border-red-900/50 bg-red-950/20"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-zinc-500">
                        Question {idx + 1} ·{" "}
                        {answer.question_type === "short_answer"
                          ? "Short Answer"
                          : "Multiple Choice"}
                      </p>
                      <p className="mt-1 font-medium">{answer.question_text}</p>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        answer.is_correct === null
                          ? "bg-yellow-900/50 text-yellow-300"
                          : answer.is_correct
                          ? "bg-green-900/50 text-green-300"
                          : "bg-red-900/50 text-red-300"
                      }`}
                    >
                      {answer.is_correct === null
                        ? "Needs Grading"
                        : answer.is_correct
                        ? `✓ ${answer.points_earned}/${answer.max_points}`
                        : `✗ ${answer.points_earned}/${answer.max_points}`}
                    </span>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs text-zinc-500">Student's Answer:</p>
                    <p className="mt-1 text-sm text-zinc-200">
                      {answer.text_answer ||
                        answer.selected_option_text ||
                        "(No answer)"}
                    </p>
                  </div>

                  {answer.correct_answer && (
                    <div className="mt-2">
                      <p className="text-xs text-zinc-500">Correct Answer:</p>
                      <p className="mt-1 text-sm text-green-300">
                        {answer.correct_answer}
                      </p>
                    </div>
                  )}

                  {/* Grading controls for short answer */}
                  {answer.question_type === "short_answer" && (
                    <div className="mt-4 flex items-center gap-2 border-t border-zinc-800 pt-4">
                      <span className="text-xs text-zinc-400">Grade:</span>
                      <button
                        onClick={() =>
                          handleGrade(answer.id, true, answer.max_points)
                        }
                        disabled={gradingAnswer === answer.id}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          answer.is_correct === true
                            ? "bg-green-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-green-900"
                        }`}
                      >
                        Full Credit ({answer.max_points})
                      </button>
                      <button
                        onClick={() =>
                          handleGrade(
                            answer.id,
                            true,
                            Math.floor(answer.max_points / 2)
                          )
                        }
                        disabled={gradingAnswer === answer.id}
                        className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300 transition hover:bg-yellow-900"
                      >
                        Partial ({Math.floor(answer.max_points / 2)})
                      </button>
                      <button
                        onClick={() => handleGrade(answer.id, false, 0)}
                        disabled={gradingAnswer === answer.id}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          answer.is_correct === false
                            ? "bg-red-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-red-900"
                        }`}
                      >
                        No Credit (0)
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
