import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { isCoordinatorAdminEmail } from "../lib/admin";
import Image from "next/image";

export default async function Home() {
  const user = await currentUser();
  
  let dashboardLink = "/onboarding";
  let dashboardLabel = "Go to Dashboard";

  if (user) {
    const role = user.publicMetadata?.role as string | undefined;
    const email = user.emailAddresses[0]?.emailAddress ?? null;
    
    if (role === "coordinator" && isCoordinatorAdminEmail(email)) {
      dashboardLink = "/coordinator/needs";
      dashboardLabel = "Coordinator Dashboard";
    } else if (role === "volunteer") {
      dashboardLink = "/volunteer/tasks";
      dashboardLabel = "Volunteer Dashboard";
    } else if (role === "reporter") {
      dashboardLink = "/reporter/my-reports";
      dashboardLabel = "Reporter Dashboard";
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* ── HERO SECTION ── */}
      <section className="relative w-full h-[80vh] min-h-[600px] flex items-center justify-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 w-full h-full">
          <Image 
            src="/hero.png" 
            alt="Volunteers helping community" 
            fill 
            className="object-cover object-center"
            priority
          />
          {/* Dark gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-transparent"></div>
        </div>

        <div className="relative z-10 w-full max-w-7xl px-6 md:px-12 flex flex-col items-start justify-center">
          <span className="inline-block py-1 px-3 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-sm font-semibold tracking-wider uppercase mb-6 backdrop-blur-sm">
            Empowering Communities
          </span>
          <h1 className="text-5xl md:text-7xl font-display font-bold text-white mb-6 max-w-3xl leading-[1.1]">
            Smart Resource Allocation for <span className="text-blue-400">Social Impact</span>
          </h1>
          <p className="text-lg md:text-2xl text-slate-200 mb-10 max-w-2xl leading-relaxed">
            Sahayak bridges the gap between critical community needs and passionate local volunteers. We ensure help reaches where it's needed most, instantly.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4">
            {user ? (
              <Link href={dashboardLink} className="px-8 py-4 bg-blue-600 text-white text-lg font-medium rounded-full hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl shadow-blue-600/20 text-center">
                {dashboardLabel} →
              </Link>
            ) : (
              <Link href="/sign-up" className="px-8 py-4 bg-blue-600 text-white text-lg font-medium rounded-full hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl shadow-blue-600/20 text-center">
                Join as a Volunteer
              </Link>
            )}
            <Link href="/submit" className="px-8 py-4 bg-white/10 text-white text-lg font-medium rounded-full border border-white/30 hover:bg-white/20 transition-all backdrop-blur-md text-center">
              Report a Need Anonymously
            </Link>
          </div>
        </div>
      </section>

      {/* ── IMPACT STATS ── */}
      <section className="py-16 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div className="space-y-2">
            <h3 className="text-4xl md:text-5xl font-display font-bold">12k+</h3>
            <p className="text-blue-200 font-medium tracking-wide uppercase text-sm">Lives Touched</p>
          </div>
          <div className="space-y-2">
            <h3 className="text-4xl md:text-5xl font-display font-bold">850</h3>
            <p className="text-blue-200 font-medium tracking-wide uppercase text-sm">Active Volunteers</p>
          </div>
          <div className="space-y-2">
            <h3 className="text-4xl md:text-5xl font-display font-bold">45</h3>
            <p className="text-blue-200 font-medium tracking-wide uppercase text-sm">Communities Served</p>
          </div>
          <div className="space-y-2">
            <h3 className="text-4xl md:text-5xl font-display font-bold">98%</h3>
            <p className="text-blue-200 font-medium tracking-wide uppercase text-sm">Needs Resolved</p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-slate-900 mb-4">How Sahayak Works</h2>
            <p className="text-slate-600 text-lg">A streamlined, tech-driven approach to disaster response, community welfare, and localized support.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-sm">📢</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">1. Report a Need</h3>
              <p className="text-slate-600 leading-relaxed">Anyone can report an urgent need in their area, pinning the exact location and severity. No account required.</p>
            </div>
            
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative">
              <div className="w-14 h-14 bg-sky-100 text-sky-600 rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-sm">🎯</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">2. Smart Matching</h3>
              <p className="text-slate-600 leading-relaxed">Our system automatically triages the need and pings local, verified volunteers with the exact required skillset.</p>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-sm">🤝</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">3. Rapid Resolution</h3>
              <p className="text-slate-600 leading-relaxed">Volunteers deploy to the site, complete the task, and administrators verify the impact in real-time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CALL TO ACTION ── */}
      <section className="py-24 bg-white border-t border-slate-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-display font-bold text-slate-900 mb-6">Ready to make a difference?</h2>
          <p className="text-lg md:text-xl text-slate-600 mb-10 leading-relaxed">
            Whether you are an organization looking to coordinate better, or an individual wanting to give back to your community, there is a place for you here.
          </p>
          <Link href="/sign-up" className="inline-block px-10 py-5 bg-slate-900 text-white text-lg font-bold rounded-full hover:bg-slate-800 transition-colors shadow-xl shadow-slate-900/20">
            Become a Volunteer Today
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-slate-900 py-12 text-slate-400">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 text-white">
            <span className="font-display text-2xl font-bold tracking-tight">Sahayak</span>
          </div>
          <div className="text-sm">
            © {new Date().getFullYear()} Sahayak Initiative. All rights reserved.
          </div>
          <div className="flex gap-6 text-sm">
            <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="#" className="hover:text-white transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
