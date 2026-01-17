"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa6";
import { useEffect, useState } from "react";

export default function ReplayPlayerPage() {
    const params = useParams();
    const filename = params.filename as string;
    // Decode in case of URI encoding, though filename usually safe
    const decodedFilename = decodeURIComponent(filename);

    return (
        <main className="min-h-screen bg-zinc-950 pt-24 px-8 pb-12 text-white flex flex-col items-center">
            <div className="w-full max-w-5xl space-y-6">
                <Link href="/replay" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
                    <FaArrowLeft />
                    Back to Replays
                </Link>

                <div className="space-y-4">
                    <h1 className="text-2xl font-mono truncate">{decodedFilename}</h1>

                    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl">
                        <video
                            src={`/recordings/${decodedFilename}`}
                            controls
                            autoPlay
                            className="w-full h-full"
                        >
                            Your browser does not support the video tag.
                        </video>
                    </div>
                </div>
            </div>
        </main>
    );
}
