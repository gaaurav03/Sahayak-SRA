import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const user = await currentUser();

  if (user) {
    const role = user.publicMetadata?.role as string | undefined;
    
    if (role === "coordinator") {
      redirect("/coordinator/needs");
    } else if (role === "volunteer") {
      redirect("/volunteer/tasks");
    } else if (role === "reporter") {
      redirect("/reporter/my-reports");
    } else {
      redirect("/onboarding");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] bg-gradient-to-b from-white to-slate-50 px-4 text-center">
      <h1 className="text-5xl md:text-6xl font-display font-bold text-slate-900 mb-6 max-w-4xl tracking-tight">
        Smart Resource Allocation for Social Impact
      </h1>
      <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl leading-relaxed">
        Sahayak connects community needs with local volunteers. We help NGOs prioritize critical issues and instantly match them with the right people.
      </p>
      
      <div className="flex flex-col sm:flex-row gap-4">
        <Link href="/sign-up" className="px-8 py-4 bg-slate-900 text-white font-medium rounded-full hover:bg-slate-800 transition-colors shadow-lg hover:shadow-xl shadow-slate-900/20">
          Get Started
        </Link>
        <Link href="/submit" className="px-8 py-4 bg-white text-slate-900 font-medium rounded-full border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all">
          Report a Need Anonymously
        </Link>
      </div>
    </div>
  );
}
