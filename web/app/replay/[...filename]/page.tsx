"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa6";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { useEffect, useState, useCallback } from "react";

type Recording = {
    filename: string;
    url: string;
    thumbnailUrl: string;
    camera?: string;
};

export default function ReplayPlayerPage() {
    const params = useParams();
    const router = useRouter();
    // Catch-all route returns an array of strings
    const filenameParam = params.filename;
    const filename = Array.isArray(filenameParam) ? filenameParam.join('/') : filenameParam;

    // Decode in case of URI encoding
    const decodedFilename = decodeURIComponent(filename as string);
    const camera = decodedFilename.split('/')[0];

    const [surrounding, setSurrounding] = useState<{ prev: string | null; next: string | null }>({ prev: null, next: null });

    useEffect(() => {
        if (!camera) return;
        fetch(`/api/replays/${camera}`)
            .then(res => res.json())
            .then((data: Recording[]) => {
                const index = data.findIndex(rec => rec.filename === decodedFilename);
                if (index !== -1) {
                    const prev = index > 0 ? data[index - 1].filename : null;
                    const next = index < data.length - 1 ? data[index + 1].filename : null;
                    setSurrounding({ prev, next });
                }
            })
            .catch(err => console.error("Failed to fetch replays for navigation:", err));
    }, [decodedFilename, camera]);

    const goPrev = useCallback(() => {
        if (surrounding.prev) {
            router.push(`/replay/${surrounding.prev}`);
        }
    }, [surrounding.prev, router]);

    const goNext = useCallback(() => {
        if (surrounding.next) {
            router.push(`/replay/${surrounding.next}`);
        }
    }, [surrounding.next, router]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") goPrev();
            if (e.key === "ArrowRight") goNext();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [goPrev, goNext]);

    return (
        <main className="min-h-screen bg-zinc-950 pt-24 px-8 pb-12 text-white flex flex-col items-center">
            <div className="w-full max-w-5xl space-y-6">
                <Link href="/replay" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
                    <FaArrowLeft />
                    Back to Replays
                </Link>

                <div className="space-y-4">
                    <h1 className="text-2xl font-mono truncate">{decodedFilename}</h1>

                    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl group/nav flex items-center justify-center">
                        {/* Previous Button */}
                        {surrounding.prev && (
                            <button 
                                onClick={goPrev}
                                className="absolute left-4 z-10 p-2 text-white transition-opacity bg-black/60 md:bg-black/20 hover:bg-black/80 rounded-full md:opacity-0 md:group-hover/nav:opacity-100"
                                aria-label="Previous replay"
                            >
                                <FiChevronLeft size={48} />
                            </button>
                        )}
                        
                        <video
                            src={`/recordings/${decodedFilename}`}
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                        >
                            Your browser does not support the video tag.
                        </video>
                        
                        {/* Next Button */}
                        {surrounding.next && (
                            <button 
                                onClick={goNext}
                                className="absolute right-4 z-10 p-2 text-white transition-opacity bg-black/60 md:bg-black/20 hover:bg-black/80 rounded-full md:opacity-0 md:group-hover/nav:opacity-100"
                                aria-label="Next replay"
                            >
                                <FiChevronRight size={48} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
