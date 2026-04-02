"use client";

import { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

type CatImage = {
    filename: string;
    url: string;
};

type PaginationData = {
    images: CatImage[];
    total: number;
    page: number;
    totalPages: number;
};

function GalleryContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pageParam = searchParams.get("page");
    const currentPage = pageParam ? parseInt(pageParam) : 1;
    const source = searchParams.get("source") || "rpi";

    const [data, setData] = useState<PaginationData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        fetch(`/api/images/${source}?page=${currentPage}&limit=50`)
            .then((res) => res.json())
            .then((res) => {
                setData(res);
                setIsLoading(false);
            })
            .catch((err) => {
                console.error("Failed to fetch gallery:", err);
                setIsLoading(false);
            });
    }, [currentPage, source]);

    const goToPage = (p: number) => {
        router.push(`/gallery?source=${source}&page=${p}`);
    };

    const handleCameraChange = (cam: string) => {
        router.push(`/gallery?source=${cam}&page=1`);
    };

    return (
        <>
            <div className="flex gap-4 mb-6">
                <button
                    onClick={() => handleCameraChange('rpi')}
                    className={`px-6 py-2 rounded-full font-medium transition-all ${source === 'rpi' ? 'bg-white text-black shadow-lg' : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                >
                    Camera #0 (RPi)
                </button>
                <button
                    onClick={() => handleCameraChange('esp32')}
                    className={`px-6 py-2 rounded-full font-medium transition-all ${source === 'esp32' ? 'bg-white text-black shadow-lg' : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                >
                    Camera #1 (ESP32)
                </button>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {data?.images.map((img) => (
                            <Link
                                key={img.filename}
                                href={`/gallery/${img.filename}?source=${source}`}
                                className="group relative aspect-square block bg-zinc-900 rounded-lg overflow-hidden border border-white/10 hover:border-white/50 transition-all"
                            >
                                <Image
                                    src={img.url}
                                    alt={img.filename}
                                    fill
                                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                                    unoptimized
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-xs font-mono">View Detail</span>
                                </div>
                            </Link>
                        ))}
                    </div>

                    {/* Pagination */}
                    {data && data.totalPages > 1 && (
                        <div className="flex justify-center items-center gap-4 mt-12 mb-8">
                            <button
                                onClick={() => goToPage(currentPage - 1)}
                                disabled={currentPage <= 1}
                                className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Previous
                            </button>
                            <span className="text-zinc-400 font-mono">
                                Page {currentPage} of {data.totalPages}
                            </span>
                            <button
                                onClick={() => goToPage(currentPage + 1)}
                                disabled={currentPage >= data.totalPages}
                                className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </>
    );
}

export default function GalleryPage() {
    return (
        <main className="min-h-screen bg-black text-white p-8 pt-24">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-4xl font-bold tracking-tighter">Highlights</h1>
                    <Link
                        href="/stream"
                        className="text-white/60 hover:text-white transition-colors flex items-center gap-2"
                    >
                        ← Back to Stream
                    </Link>
                </div>

                <Suspense fallback={
                    <div className="flex justify-center items-center h-64">
                        <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                }>
                    <GalleryContent />
                </Suspense>
            </div>
        </main>
    );
}
