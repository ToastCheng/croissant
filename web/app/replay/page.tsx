"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FaPlay } from "react-icons/fa6";

type Recording = {
    filename: string;
    url: string;
};

export default function ReplayPage() {
    const [recordings, setRecordings] = useState<Recording[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/replays')
            .then(res => res.json())
            .then(data => {
                setRecordings(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch recordings:", err);
                setLoading(false);
            });
    }, []);

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

                {recordings.length === 0 ? (
                    <div className="text-zinc-500 text-lg">No recordings found.</div>
                ) : (
                    <div className="grid grid-cols-3 gap-2 md:grid-cols-3 lg:grid-cols-4 md:gap-6">
                        {recordings.map((rec) => (
                            <Link
                                key={rec.filename}
                                href={`/replay/${rec.filename}`}
                                className="group relative block bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-colors"
                            >
                                <div className="aspect-video relative">
                                    {/* Use video as thumbnail. Muted, preload metadata. */}
                                    <video
                                        src={`/recordings/${rec.filename}#t=0.1`}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        preload="metadata"
                                        muted
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
