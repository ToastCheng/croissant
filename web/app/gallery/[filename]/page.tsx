"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function ImageDetailPage() {
    const params = useParams();
    const router = useRouter();
    const filename = params.filename as string;
    // Decode in case of URL encoding, though usually filenames are safe
    const decodedFilename = decodeURIComponent(filename);

    return (
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative">
            {/* Back Button */}
            <div className="absolute top-8 left-8 z-20">
                <button
                    onClick={() => router.back()}
                    className="bg-black/50 backdrop-blur-md border border-white/10 text-white px-6 py-2 rounded-full hover:bg-white/10 transition-colors flex items-center gap-2"
                >
                    ← Back
                </button>
            </div>

            <div className="relative w-full max-w-5xl h-[80vh] bg-zinc-900 rounded-lg overflow-hidden shadow-2xl border border-zinc-800">
                <Image
                    src={`/images/${decodedFilename}`}
                    alt={decodedFilename}
                    fill
                    className="object-contain"
                    unoptimized
                    priority
                />
            </div>

            <div className="mt-6 text-center space-y-2">
                <h1 className="text-2xl font-bold font-mono tracking-wider">
                    {decodedFilename}
                </h1>
                <a
                    href={`/images/${decodedFilename}`}
                    download
                    className="text-green-400 hover:text-green-300 text-sm underline decoration-dotted underline-offset-4"
                >
                    Download Original
                </a>
            </div>
        </main>
    );
}
