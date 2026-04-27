export default function VolunteerTasksPage() {
  return (
    <div>
      <h1 className="text-3xl font-display font-bold text-slate-900 mb-6">My Assigned Tasks</h1>
      
      <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-2xl text-center">
        <p className="text-emerald-800 font-medium">You don't have any assigned tasks right now.</p>
        <p className="text-emerald-600 text-sm mt-2">When a coordinator assigns you a task matching your skills, it will appear here.</p>
      </div>
    </div>
  );
}
