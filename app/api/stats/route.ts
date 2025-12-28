import { NextResponse } from 'next/server';
import os from "node:os";
import fs from "node:fs";

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

  // 1 minute load average as a proxy for % usage
  // Note: load average can be higher than 1 per core in Linux, but we'll percentage-ify it relative to cores
  const loadAvg = os.loadavg()[0];
  const usagePercent = (loadAvg / cpus.length) * 100;
  return Math.min(usagePercent, 100).toFixed(1);
}

export async function GET() {
  const hostname = os.hostname();
  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();

  const totalMem = (totalMemBytes / (1024 * 1024 * 1024)).toFixed(2); // GB
  const freeMem = (freeMemBytes / (1024 * 1024 * 1024)).toFixed(2); // GB
  const usedMem = (parseFloat(totalMem) - parseFloat(freeMem)).toFixed(2);
  const memUsagePercent = ((parseFloat(usedMem) / parseFloat(totalMem)) * 100).toFixed(1);
  const cpuTemp = getCpuTemperature();
  const cpuUsage = getCpuUsage();
  const uptime = (os.uptime() / 3600).toFixed(1); // Hours

  return NextResponse.json({
    hostname,
    totalMem,
    usedMem,
    memUsagePercent,
    cpuTemp,
    cpuUsage,
    uptime
  });
}
