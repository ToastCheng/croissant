
import { cookies } from "next/headers";
import StatsDashboard from "../../components/StatsDashboard";

// Fetch initial data on server to ensure SSR (fast FCP)
async function getInitialData() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    const headers: Record<string, string> = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // SSR fetch directly to backend to avoid loopback proxy issues and invalid relative URLs
    const res = await fetch('http://localhost:8080/api/stats', {
      headers,
      cache: 'no-store'
    });

    if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
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
