import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

export default async function VolunteerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user || user.publicMetadata.role !== "volunteer") {
    redirect("/");
  }

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-50 border-r border-gray-200 p-6 flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Volunteer Panel</h2>
        <Link href="/volunteer/tasks" className="text-slate-700 hover:text-emerald-600 font-medium">My Tasks</Link>
        <Link href="/volunteer/profile" className="text-slate-700 hover:text-emerald-600 font-medium">Profile & Skills</Link>
        <Link href="/volunteer/history" className="text-slate-700 hover:text-emerald-600 font-medium">History</Link>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8 bg-white">
        {children}
      </main>
    </div>
  );
}
