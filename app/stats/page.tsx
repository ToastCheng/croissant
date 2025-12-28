import os from "node:os";
import fs from "node:fs";
import StatsDashboard from "../../components/StatsDashboard";

function getCpuTemperature() {
  try {
    const temp = fs.readFileSync("/sys/class/thermal/thermal_zone0/temp", "utf8");
    return (parseInt(temp) / 1000).toFixed(1);
  } catch (e) {
    return "N/A";
  }
}

function getCpuUsage() {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) return "0.0";
  const loadAvg = os.loadavg()[0];
  const usagePercent = (loadAvg / cpus.length) * 100;
  return Math.min(usagePercent, 100).toFixed(1);
}

// We still fetch initial data on the server for instant First Contentful Paint
async function getInitialData() {
  const hostname = os.hostname();
  const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
  const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
  const usedMem = (parseFloat(totalMem) - parseFloat(freeMem)).toFixed(2);
  const memUsagePercent = ((parseFloat(usedMem) / parseFloat(totalMem)) * 100).toFixed(1);
  const cpuTemp = getCpuTemperature();
  const cpuUsage = getCpuUsage();
  const uptime = (os.uptime() / 3600).toFixed(1);

  return {
    hostname,
    totalMem,
    usedMem,
    memUsagePercent,
    cpuTemp,
    cpuUsage,
    uptime
  };
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
