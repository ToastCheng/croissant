"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FaPlay } from "react-icons/fa6";

type Recording = {
    filename: string;
    url: string;
    thumbnailUrl: string;
    camera?: string;
};

export default function ReplayPage() {
    const [recordings, setRecordings] = useState<Recording[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'rpi' | 'esp32'>('rpi');

    useEffect(() => {
        setLoading(true);
        fetch(`/api/replays/${activeTab}`)
            .then(res => res.json())
            .then(data => {
                setRecordings(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch recordings:", err);
                setLoading(false);
            });
    }, [activeTab]);

    // No client-side filtering needed anymore
    const filteredRecordings = recordings;

    if (loading) {
        return (
            <main className="min-h-screen bg-zinc-950 pt-24 px-8 pb-12 text-white flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-zinc-950 pt-24 px-8 pb-12 text-white">
            <div className="max-w-7xl mx-auto space-y-8">
                <h1 className="text-4xl font-bold tracking-tight">Replays</h1>

                {/* Camera Tabs */}
                <div className="flex gap-4">
                    <button
                        onClick={() => setActiveTab('rpi')}
                        className={`px-6 py-2 rounded-full font-medium transition-all ${activeTab === 'rpi' ? 'bg-white text-black shadow-lg' : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                    >
                        Camera #0 (RPi)
                    </button>
                    <button
                        onClick={() => setActiveTab('esp32')}
                        className={`px-6 py-2 rounded-full font-medium transition-all ${activeTab === 'esp32' ? 'bg-white text-black shadow-lg' : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                    >
                        Camera #1 (ESP32)
                    </button>
                </div>

                {filteredRecordings.length === 0 ? (
                    <div className="text-zinc-500 text-lg">No recordings found for {activeTab === 'rpi' ? 'RPi' : 'ESP32'}.</div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                        {filteredRecordings.filter(rec => rec.thumbnailUrl).map((rec) => (
                            <Link
                                key={rec.filename}
                                href={`/replay/${rec.filename}`}
                                className="group relative block bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-colors"
                            >
                                <div className="aspect-video relative bg-zinc-800">
                                    <img
                                        src={rec.thumbnailUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 800 450'%3E%3Crect fill='%2327272a' width='800' height='450'/%3E%3Ctext fill='%2371717a' font-family='sans-serif' font-size='30' dy='10.5' font-weight='bold' x='50%25' y='50%25' text-anchor='middle'%3EProcessing...%3C/text%3E%3C/svg%3E"}
                                        alt={rec.filename}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 duration-300">
                                        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                                            <FaPlay size={20} className="ml-1" />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-2 md:p-4">
                                    <h2 className="text-[10px] md:text-sm font-mono text-zinc-300 truncate">{rec.filename}</h2>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
