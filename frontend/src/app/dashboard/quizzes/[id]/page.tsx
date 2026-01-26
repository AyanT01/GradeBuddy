import { QuizDetail } from "@/components/QuizDetail";

type QuizPageProps = {
  params: Promise<{ id: string }>;
};

export default async function QuizPage({ params }: QuizPageProps) {
  const { id } = await params;
  const quizId = Number(id);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-10 px-6 py-12">
        <QuizDetail quizId={quizId} />
      </main>
    </div>
  );
}
