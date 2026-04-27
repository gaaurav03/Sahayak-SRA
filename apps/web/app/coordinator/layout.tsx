import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

export default async function CoordinatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user || user.publicMetadata.role !== "coordinator") {
    redirect("/");
  }

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-50 border-r border-gray-200 p-6 flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Coordinator</h2>
        <Link href="/coordinator/needs" className="text-slate-700 hover:text-purple-600 font-medium">Needs Dashboard</Link>
        <Link href="/coordinator/tasks" className="text-slate-700 hover:text-purple-600 font-medium">All Tasks</Link>
        <Link href="/coordinator/volunteers" className="text-slate-700 hover:text-purple-600 font-medium">Volunteers</Link>
        <Link href="/coordinator/analytics" className="text-slate-700 hover:text-purple-600 font-medium mt-4">Analytics</Link>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-slate-100 p-4 sm:p-8">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
