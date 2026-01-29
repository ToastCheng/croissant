
import StatsDashboard from "../../components/StatsDashboard";

// Fetch initial data on server to ensure SSR (fast FCP)
async function getInitialData() {
  try {
    // SSR fetch to local backend (via proxy or direct)
    const res = await fetch('/api/stats', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch stats');
    return await res.json();
  } catch (e) {
    console.error("Error fetching initial stats:", e);
    return null;
  }
}

export default async function StatsPage() {
  const initialData = await getInitialData();

  return (
    <main className="min-h-screen bg-zinc-950 pt-24 px-8 pb-12 text-white">
      <div className="max-w-5xl mx-auto">
        <StatsDashboard initialData={initialData} />
      </div>
    </main>
  );
}
