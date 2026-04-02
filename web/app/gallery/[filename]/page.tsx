"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

function ImageDetailContent() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const source = searchParams.get("source") || "rpi";
    const filename = params.filename as string;
    // Decode in case of URL encoding, though usually filenames are safe
    const decodedFilename = decodeURIComponent(filename);

    const [surrounding, setSurrounding] = useState<{ prev: string | null; next: string | null }>({ prev: null, next: null });

    useEffect(() => {
        fetch(`/api/images/${source}/${encodeURIComponent(decodedFilename)}/surrounding`)
            .then(res => res.json())
            .then(data => {
                if (!data.error) {
                    setSurrounding({ prev: data.prev, next: data.next });
                }
            })
            .catch(err => console.error("Failed to fetch surrounding images:", err));
    }, [decodedFilename, source]);

    const goPrev = useCallback(() => {
        if (surrounding.prev) {
            router.push(`/gallery/${encodeURIComponent(surrounding.prev)}?source=${source}`);
        }
    }, [surrounding.prev, router, source]);

    const goNext = useCallback(() => {
        if (surrounding.next) {
            router.push(`/gallery/${encodeURIComponent(surrounding.next)}?source=${source}`);
        }
    }, [surrounding.next, router, source]);

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
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative">
            {/* Back Button */}
            <div className="absolute top-8 left-8 z-20">
                <button
                    onClick={() => router.push(`/gallery?source=${source}&page=1`)}
                    className="bg-black/50 backdrop-blur-md border border-white/10 text-white px-6 py-2 rounded-full hover:bg-white/10 transition-colors flex items-center gap-2"
                >
                    ← Back
                </button>
            </div>

            <div className="relative w-full max-w-5xl h-[80vh] flex items-center justify-center group/nav">
                {/* Previous Button */}
                {surrounding.prev && (
                    <button 
                        onClick={goPrev}
                        className="absolute left-2 md:-left-12 z-10 p-2 text-white transition-opacity bg-black/60 md:bg-black/20 hover:bg-black/80 rounded-full md:opacity-0 md:group-hover/nav:opacity-100"
                        aria-label="Previous image"
                    >
                        <FiChevronLeft size={48} />
                    </button>
                )}

                <div className="relative w-full h-full bg-zinc-900 rounded-lg overflow-hidden shadow-2xl border border-zinc-800">
                    <Image
                        src={`/images/${source}/${decodedFilename}`}
                        alt={decodedFilename}
                        fill
                        className="object-contain"
                        unoptimized
                        priority
                    />
                </div>

                {/* Next Button */}
                {surrounding.next && (
                    <button 
                        onClick={goNext}
                        className="absolute right-2 md:-right-12 z-10 p-2 text-white transition-opacity bg-black/60 md:bg-black/20 hover:bg-black/80 rounded-full md:opacity-0 md:group-hover/nav:opacity-100"
                        aria-label="Next image"
                    >
                        <FiChevronRight size={48} />
                    </button>
                )}
            </div>

            <div className="mt-6 text-center space-y-2">
                <h1 className="text-2xl font-bold font-mono tracking-wider">
                    {decodedFilename}
                </h1>
                <a
                    href={`/images/${source}/${decodedFilename}`}
                    download
                    className="text-green-400 hover:text-green-300 text-sm underline decoration-dotted underline-offset-4 inline-block"
                >
                    Download Original
                </a>
            </div>
        </main>
    );
}

export default function ImageDetailPage() {
    return (
        <Suspense fallback={
            <main className="min-h-screen bg-black flex justify-center items-center">
                <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            </main>
        }>
            <ImageDetailContent />
        </Suspense>
    );
}
