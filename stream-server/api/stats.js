import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';

const router = Router();

router.get('/', (req, res) => {
    const getCpuTemperature = () => {
        try {
            const temp = fs.readFileSync("/sys/class/thermal/thermal_zone0/temp", "utf8");
            return (parseInt(temp) / 1000).toFixed(1);
        } catch (e) {
            return "N/A";
        }
    };

    const getCpuUsage = () => {
        const cpus = os.cpus();
        if (!cpus || cpus.length === 0) return "0.0";
        const loadAvg = os.loadavg()[0];
        const usagePercent = (loadAvg / cpus.length) * 100;
        return Math.min(usagePercent, 100).toFixed(1);
    };

    const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
    const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    const usedMem = (parseFloat(totalMem) - parseFloat(freeMem)).toFixed(2);
    const memUsagePercent = ((parseFloat(usedMem) / parseFloat(totalMem)) * 100).toFixed(1);

    res.json({
        hostname: os.hostname(),
        totalMem,
        usedMem,
        memUsagePercent,
        cpuTemp: getCpuTemperature(),
        cpuUsage: getCpuUsage(),
        uptime: (os.uptime() / 3600).toFixed(1)
    });
});

export default router;
