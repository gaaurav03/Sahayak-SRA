import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

export default async function ReporterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user || user.publicMetadata.role !== "reporter") {
    redirect("/");
  }

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-50 border-r border-gray-200 p-6 flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Reporter Panel</h2>
        <Link href="/submit" className="bg-blue-600 text-white text-center py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">Submit New Need</Link>
        <Link href="/reporter/my-reports" className="text-slate-700 hover:text-blue-600 font-medium mt-4">My Submissions</Link>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8 bg-white">
        {children}
      </main>
    </div>
  );
}
