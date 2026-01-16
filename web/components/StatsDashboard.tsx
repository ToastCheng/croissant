"use client";

import { useEffect, useState } from "react";

// Define the shape of our stats data
type StatsData = {
  hostname: string;
  totalMem: string;
  usedMem: string;
  memUsagePercent: string;
  cpuTemp: string;
  cpuUsage: string;
  uptime: string;
};

export default function StatsDashboard({ initialData }: { initialData?: StatsData }) {
  const [data, setData] = useState<StatsData | null>(initialData || null);
  const [isContinuous, setIsContinuous] = useState(false);

  useEffect(() => {
    // Poll stats every 2 seconds
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const newData = await res.json();
          setData(newData);
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      }
    }, 2000);

    // Fetch initial settings
    fetch('/api/settings')
      .then(res => res.json())
      .then(res => {
        setIsContinuous(res.mode === 'continuous');
      })
      .catch(err => console.error("Failed to fetch settings:", err));

    return () => clearInterval(interval);
  }, []);

  const toggleMode = async () => {
    const newMode = isContinuous ? 'on-demand' : 'continuous';
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ mode: newMode }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        setIsContinuous(!isContinuous);
      }
    } catch (error) {
      console.error("Failed to update mode:", error);
    }
  };

  if (!data) return <div className="text-white">Loading...</div>;

  return (
    <div className="space-y-12">
      <header className="flex flex-col gap-6">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-white/90">System Status</h1>
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <p>Real-time telemetry for {data.hostname}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
          <span className="text-zinc-400 font-medium">Continuous Mode</span>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isContinuous}
              onChange={() => toggleMode()}
            />
            <div className="relative w-14 h-8 bg-zinc-600 peer-focus:outline-none rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:top-1 after:start-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:after:translate-x-6"></div>
          </label>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card title="Hostname" value={data.hostname} icon="🖥️" color="text-blue-400" />

        <Card
          title="CPU Temperature"
          value={`${data.cpuTemp}°C`}
          icon="🌡️"
          color={parseFloat(data.cpuTemp) > 60 ? "text-red-400" : "text-green-400"}
        />

        <Card
          title="CPU Load (1m)"
          value={`${data.cpuUsage}%`}
          icon="⚡"
          color="text-yellow-400"
        />

        <Card
          title="Memory Usage"
          value={`${data.usedMem} / ${data.totalMem} GB`}
          subValue={`${data.memUsagePercent}%`}
          icon="🧠"
          color="text-purple-400"
        />

        <Card
          title="Uptime"
          value={`${data.uptime} hrs`}
          icon="⏱️"
          color="text-cyan-400"
        />
      </div>
    </div>
  );
}

function Card({ title, value, subValue, icon, color }: { title: string, value: string, subValue?: string, icon: string, color: string }) {
  return (
    <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <span className="text-zinc-400 text-sm font-medium uppercase tracking-wider">{title}</span>
          <div className={`text-3xl font-mono ${color}`}>{value}</div>
          {subValue && <div className="text-sm text-zinc-500">{subValue}</div>}
        </div>
        <div className="text-2xl opacity-50">{icon}</div>
      </div>
    </div>
  );
}
