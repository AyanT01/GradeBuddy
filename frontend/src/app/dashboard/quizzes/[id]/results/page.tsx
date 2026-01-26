import { QuizResults } from "@/components/QuizResults";

type QuizResultsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function QuizResultsPage({ params }: QuizResultsPageProps) {
  const { id } = await params;
  const quizId = Number(id);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-10 px-6 py-12">
        <QuizResults quizId={quizId} />
      </main>
    </div>
  );
}
