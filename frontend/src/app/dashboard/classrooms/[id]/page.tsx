import { ClassroomDetail } from "@/components/ClassroomDetail";

type ClassroomPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClassroomPage({ params }: ClassroomPageProps) {
  const { id } = await params;
  const classroomId = Number(id);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <ClassroomDetail classroomId={classroomId} />
      </main>
    </div>
  );
}
