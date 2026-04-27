import TaskCreateClient from "./TaskCreateClient";

export const dynamic = "force-dynamic";

export default async function CreateTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ report_id?: string }>;
}) {
  const params = await searchParams;
  return <TaskCreateClient reportId={params.report_id ?? ""} />;
}
