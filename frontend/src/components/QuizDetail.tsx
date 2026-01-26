"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetch, ApiError } from "@/lib/api";

type Role = "student" | "teacher";
type QuestionType = "multiple_choice" | "true_false" | "short_answer";

type Option = {
  id: number;
  text: string;
  is_correct: boolean | null;
};

type Question = {
  id: number;
  question_text: string;
  question_type: QuestionType;
  points: number;
  options: Option[];
};

type Quiz = {
  id: number;
  title: string;
  description: string | null;
  classroom_id: number;
  time_limit_minutes: number | null;
  is_published: boolean;
  questions: Question[];
  total_points: number;
};

type SyncResponse = {
  id: number;
  role: Role;
};

type QuizDetailProps = {
  quizId: number;
};

type Answer = {
  selected_option_id?: number;
  text_answer?: string;
};

export function QuizDetail({ quizId }: QuizDetailProps) {
  const { getToken } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Teacher: Add question form
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>("multiple_choice");
  const [newQuestion, setNewQuestion] = useState("");
  const [newOptions, setNewOptions] = useState([
    { text: "", is_correct: false },
    { text: "", is_correct: false },
    { text: "", is_correct: false },
    { text: "", is_correct: false },
  ]);
  const [addingQuestion, setAddingQuestion] = useState(false);

  // Student: Quiz attempt
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    max_score: number;
    percentage: number;
  } | null>(null);

  const loadQuiz = useCallback(async () => {
    try {
      const token = await getToken();

      const syncRes = await apiFetch<SyncResponse>("/auth/sync", token, {
        method: "POST",
        body: {},
      });
      setRole(syncRes.role);

      const quizRes = await apiFetch<Quiz>(`/quizzes/${quizId}`, token, {
        method: "GET",
      });
      setQuiz(quizRes);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to load quiz");
    } finally {
      setLoading(false);
    }
  }, [getToken, quizId]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const handleAddQuestion = async () => {
    if (!newQuestion.trim()) return;

    // For multiple choice, need at least one correct answer
    if (newQuestionType !== "short_answer") {
      const hasCorrect = newOptions.some((o) => o.is_correct && o.text.trim());
      if (!hasCorrect) {
        setError("Please mark at least one correct answer");
        return;
      }
    }

    try {
      setAddingQuestion(true);
      setError(null);
      const token = await getToken();

      await apiFetch(`/quizzes/${quizId}/questions`, token, {
        method: "POST",
        body: {
          question_text: newQuestion,
          question_type: newQuestionType,
          points: 1,
          options:
            newQuestionType === "short_answer"
              ? []
              : newOptions
                  .filter((o) => o.text.trim())
                  .map((o) => ({ text: o.text, is_correct: o.is_correct })),
        },
      });

      setNewQuestion("");
      setNewQuestionType("multiple_choice");
      setNewOptions([
        { text: "", is_correct: false },
        { text: "", is_correct: false },
        { text: "", is_correct: false },
        { text: "", is_correct: false },
      ]);
      setShowAddQuestion(false);
      await loadQuiz();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to add question");
    } finally {
      setAddingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId: number) => {
    try {
      const token = await getToken();
      await apiFetch(`/questions/${questionId}`, token, { method: "DELETE" });
      await loadQuiz();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to delete question");
    }
  };

  const handlePublish = async () => {
    try {
      const token = await getToken();
      await apiFetch(`/quizzes/${quizId}/publish`, token, { method: "PUT" });
      await loadQuiz();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to publish quiz");
    }
  };

  const handleStartQuiz = async () => {
    try {
      const token = await getToken();
      const res = await apiFetch<{ attempt_id: number }>(
        `/quizzes/${quizId}/start`,
        token,
        { method: "POST" }
      );
      setAttemptId(res.attempt_id);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to start quiz");
    }
  };

  const handleSubmitQuiz = async () => {
    if (!attemptId) return;

    try {
      setSubmitting(true);
      const token = await getToken();

      const answersPayload = Object.entries(answers).map(([qId, ans]) => ({
        question_id: Number(qId),
        selected_option_id: ans.selected_option_id,
        text_answer: ans.text_answer,
      }));

      const res = await apiFetch<{
        score: number;
        max_score: number;
        percentage: number;
      }>(`/attempts/${attemptId}/submit`, token, {
        method: "POST",
        body: { answers: answersPayload },
      });

      setResult(res);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || "Unable to submit quiz");
    } finally {
      setSubmitting(false);
    }
  };

  const updateAnswer = (questionId: number, update: Partial<Answer>) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...update },
    }));
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
        Loading quiz...
      </div>
    );
  }

  if (error && !quiz) {
    return (
      <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-8 text-center text-red-200">
        {error}
        <Link
          href="/dashboard"
          className="mt-4 block text-sm text-zinc-400 underline"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!quiz) return null;

  // Student completed quiz - show results
  if (result) {
    const hasShortAnswer = quiz.questions.some(
      (q) => q.question_type === "short_answer"
    );

    return (
      <section className="space-y-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
          <h1 className="text-2xl font-bold">Quiz Submitted!</h1>
          <div className="mt-6">
            <p className="text-5xl font-bold text-white">{result.percentage}%</p>
            <p className="mt-2 text-zinc-400">
              {result.score} / {result.max_score} points (auto-graded)
            </p>
            {hasShortAnswer && (
              <p className="mt-2 text-sm text-yellow-400">
                Short answer questions will be graded by your teacher
              </p>
            )}
          </div>
          <Link
            href={`/dashboard/classrooms/${quiz.classroom_id}`}
            className="mt-8 inline-block rounded-full bg-white px-6 py-2 font-semibold text-zinc-900"
          >
            Back to Classroom
          </Link>
        </div>
      </section>
    );
  }

  // Student taking quiz
  if (role === "student" && attemptId) {
    return (
      <section className="space-y-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h1 className="text-2xl font-semibold">{quiz.title}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {quiz.questions.length} questions · {quiz.total_points} points
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {quiz.questions.map((question, idx) => (
            <div
              key={question.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"
            >
              <div className="flex items-start justify-between">
                <p className="text-sm text-zinc-500">Question {idx + 1}</p>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                  {question.question_type === "short_answer"
                    ? "Short Answer"
                    : "Multiple Choice"}
                </span>
              </div>
              <p className="mt-2 text-lg font-medium">{question.question_text}</p>

              {question.question_type === "short_answer" ? (
                <textarea
                  value={answers[question.id]?.text_answer || ""}
                  onChange={(e) =>
                    updateAnswer(question.id, { text_answer: e.target.value })
                  }
                  placeholder="Type your answer here..."
                  rows={4}
                  className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm focus:border-zinc-500 focus:outline-none"
                />
              ) : (
                <div className="mt-4 space-y-2">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                        answers[question.id]?.selected_option_id === option.id
                          ? "border-white bg-white/10"
                          : "border-zinc-700 hover:border-zinc-500"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        checked={
                          answers[question.id]?.selected_option_id === option.id
                        }
                        onChange={() =>
                          updateAnswer(question.id, {
                            selected_option_id: option.id,
                          })
                        }
                        className="sr-only"
                      />
                      <div
                        className={`h-4 w-4 rounded-full border-2 ${
                          answers[question.id]?.selected_option_id === option.id
                            ? "border-white bg-white"
                            : "border-zinc-500"
                        }`}
                      />
                      <span>{option.text}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmitQuiz}
          disabled={submitting}
          className="w-full rounded-full bg-white py-3 font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Quiz"}
        </button>
      </section>
    );
  }

  // Student view (not started)
  if (role === "student") {
    const hasShortAnswer = quiz.questions.some(
      (q) => q.question_type === "short_answer"
    );

    return (
      <section className="space-y-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <Link
            href={`/dashboard/classrooms/${quiz.classroom_id}`}
            className="text-sm text-zinc-400 hover:text-zinc-300"
          >
            ← Back to classroom
          </Link>
          <h1 className="mt-4 text-2xl font-semibold">{quiz.title}</h1>
          {quiz.description && (
            <p className="mt-2 text-zinc-400">{quiz.description}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-zinc-500">
            <span>{quiz.questions.length} questions</span>
            <span>{quiz.total_points} points</span>
            {quiz.time_limit_minutes && (
              <span>{quiz.time_limit_minutes} min limit</span>
            )}
            {hasShortAnswer && (
              <span className="text-yellow-400">Includes short answer</span>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          onClick={handleStartQuiz}
          className="w-full rounded-full bg-white py-3 font-semibold text-zinc-900 transition hover:bg-zinc-200"
        >
          Start Quiz
        </button>
      </section>
    );
  }

  // Teacher view (quiz builder)
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="flex items-start justify-between">
          <div>
            <Link
              href={`/dashboard/classrooms/${quiz.classroom_id}`}
              className="text-sm text-zinc-400 hover:text-zinc-300"
            >
              ← Back to classroom
            </Link>
            <h1 className="mt-4 text-2xl font-semibold">{quiz.title}</h1>
            {quiz.description && (
              <p className="mt-2 text-zinc-400">{quiz.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {quiz.is_published ? (
              <span className="rounded-full bg-green-900/50 px-3 py-1 text-xs text-green-300">
                Published
              </span>
            ) : (
              <button
                onClick={handlePublish}
                disabled={quiz.questions.length === 0}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
              >
                Publish
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 flex gap-4 text-sm text-zinc-500">
          <span>{quiz.questions.length} questions</span>
          <span>{quiz.total_points} points total</span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Questions list */}
      <div className="space-y-4">
        {quiz.questions.map((question, idx) => (
          <div
            key={question.id}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-zinc-500">
                    Question {idx + 1} · {question.points} pt
                  </p>
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                    {question.question_type === "short_answer"
                      ? "Short Answer"
                      : question.question_type === "true_false"
                      ? "True/False"
                      : "Multiple Choice"}
                  </span>
                </div>
                <p className="mt-1 font-medium">{question.question_text}</p>
              </div>
              {!quiz.is_published && (
                <button
                  onClick={() => handleDeleteQuestion(question.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              )}
            </div>
            {question.question_type !== "short_answer" && (
              <div className="mt-3 space-y-1">
                {question.options.map((opt) => (
                  <div
                    key={opt.id}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      opt.is_correct
                        ? "bg-green-900/30 text-green-300"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {opt.text} {opt.is_correct && "✓"}
                  </div>
                ))}
              </div>
            )}
            {question.question_type === "short_answer" && (
              <p className="mt-3 text-xs text-zinc-500 italic">
                Students will type their answer. Requires manual grading.
              </p>
            )}
          </div>
        ))}

        {quiz.questions.length === 0 && !showAddQuestion && (
          <div className="rounded-2xl border border-dashed border-zinc-700 py-8 text-center text-zinc-500">
            No questions yet. Add your first question below.
          </div>
        )}
      </div>

      {/* Add question form */}
      {!quiz.is_published && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          {showAddQuestion ? (
            <div className="space-y-4">
              {/* Question type selector */}
              <div>
                <label className="text-xs text-zinc-400">Question Type</label>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setNewQuestionType("multiple_choice")}
                    className={`rounded-full px-4 py-1.5 text-sm transition ${
                      newQuestionType === "multiple_choice"
                        ? "bg-white text-zinc-900"
                        : "border border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    Multiple Choice
                  </button>
                  <button
                    onClick={() => setNewQuestionType("true_false")}
                    className={`rounded-full px-4 py-1.5 text-sm transition ${
                      newQuestionType === "true_false"
                        ? "bg-white text-zinc-900"
                        : "border border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    True/False
                  </button>
                  <button
                    onClick={() => setNewQuestionType("short_answer")}
                    className={`rounded-full px-4 py-1.5 text-sm transition ${
                      newQuestionType === "short_answer"
                        ? "bg-white text-zinc-900"
                        : "border border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    Short Answer
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Question</label>
                <textarea
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="Enter your question..."
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>

              {/* Options for multiple choice / true-false */}
              {newQuestionType !== "short_answer" && (
                <div>
                  <label className="text-xs text-zinc-400">
                    {newQuestionType === "true_false"
                      ? "Options (check the correct one)"
                      : "Options (check the correct answer)"}
                  </label>
                  <div className="mt-2 space-y-2">
                    {(newQuestionType === "true_false"
                      ? [
                          { text: "True", is_correct: false },
                          { text: "False", is_correct: false },
                        ]
                      : newOptions
                    ).map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={
                            newQuestionType === "true_false"
                              ? newOptions[0]?.is_correct === (idx === 0)
                              : opt.is_correct
                          }
                          onChange={(e) => {
                            if (newQuestionType === "true_false") {
                              // For true/false, set the correct answer
                              setNewOptions([
                                { text: "True", is_correct: idx === 0 },
                                { text: "False", is_correct: idx === 1 },
                              ]);
                            } else {
                              const updated = [...newOptions];
                              updated[idx].is_correct = e.target.checked;
                              setNewOptions(updated);
                            }
                          }}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800"
                        />
                        {newQuestionType === "true_false" ? (
                          <span className="text-sm text-zinc-300">
                            {opt.text}
                          </span>
                        ) : (
                          <input
                            value={opt.text}
                            onChange={(e) => {
                              const updated = [...newOptions];
                              updated[idx].text = e.target.value;
                              setNewOptions(updated);
                            }}
                            placeholder={`Option ${idx + 1}`}
                            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {newQuestionType === "short_answer" && (
                <p className="text-xs text-zinc-500 italic">
                  Short answer questions require manual grading after students
                  submit.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleAddQuestion}
                  disabled={addingQuestion}
                  className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
                >
                  {addingQuestion ? "Adding..." : "Add Question"}
                </button>
                <button
                  onClick={() => {
                    setShowAddQuestion(false);
                    setNewQuestionType("multiple_choice");
                  }}
                  className="rounded-full border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition hover:border-zinc-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddQuestion(true)}
              className="flex w-full items-center justify-center gap-2 py-2 text-sm text-zinc-400 transition hover:text-white"
            >
              <span className="text-lg">+</span> Add Question
            </button>
          )}
        </div>
      )}

      {/* View results link */}
      {quiz.is_published && (
        <Link
          href={`/dashboard/quizzes/${quiz.id}/results`}
          className="block rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center transition hover:border-zinc-600"
        >
          View Student Results →
        </Link>
      )}
    </section>
  );
}
