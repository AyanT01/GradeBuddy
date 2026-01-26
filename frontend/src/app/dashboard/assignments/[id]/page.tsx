import { AssignmentDetail } from "@/components/AssignmentDetail";

type AssignmentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AssignmentPage({ params }: AssignmentPageProps) {
  const { id } = await params;
  const assignmentId = Number(id);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <AssignmentDetail assignmentId={assignmentId} />
      </main>
    </div>
  );
}
