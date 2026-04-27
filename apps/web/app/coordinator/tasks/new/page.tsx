import TaskCreateClient from "./TaskCreateClient";

export const dynamic = "force-dynamic";

export default function CreateTaskPage({
  searchParams,
}: {
  searchParams: { report_id?: string };
}) {
  return <TaskCreateClient reportId={searchParams.report_id ?? ""} />;
}
