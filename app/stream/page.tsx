'use client';

import { useState, useRef, useEffect } from 'react';

export default function StreamPage() {
    const [isConnected, setIsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const videoRef = useRef<HTMLImageElement>(null);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        // Connect to WebSocket server on mount
        // Use environment variable if set, otherwise derive from current location
        // This supports 'example.com' automatically assuming port 8080 is open
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.hostname;
        const port = '8080'; // Default port for stream-server

        const wsUrl = process.env.WS_URL || `${protocol}://${host}:${port}`;

        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
            console.log('Connected to Stream Server');
            setIsConnected(true);
        };

        ws.onclose = () => {
            console.log('Disconnected from Stream Server');
            setIsConnected(false);
            setIsStreaming(false);
        };

        ws.onmessage = (event) => {
            // Crude handling: Assume each message is a full valid JPEG for this demo
            // In production, we'd need a buffer builder to stitch chunks if they are fragmented
            // For now, if 'image2pipe' flushes well, we might get away with it or see glitches
            const arrayBuffer = event.data;
            const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);

            if (videoRef.current) {
                // Revoke previous to avoid leak
                const prev = videoRef.current.src;
                if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                videoRef.current.src = url;
            }
        };

        wsRef.current = ws;

        return () => {
            ws.close();
        };
    }, []);

    const handleStart = () => {
        if (wsRef.current && isConnected) {
            wsRef.current.send('start');
            setIsStreaming(true);
        }
    };

    const handleStop = () => {
        if (wsRef.current && isConnected) {
            wsRef.current.send('stop');
            setIsStreaming(false);
        }
    };

    return (
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 pt-24">
            <h1 className="text-4xl font-bold mb-8 tracking-tighter">Live Stream</h1>

            <div className="relative w-full max-w-4xl aspect-video bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl flex items-center justify-center">
                {isConnected ? (
                    <img
                        ref={videoRef}
                        alt="Live Stream"
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <div className="text-zinc-500">Connecting to server...</div>
                )}

                {/* Overlay if not streaming but connected */}
                {isConnected && !isStreaming && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <p className="text-xl font-medium">Ready to Stream</p>
                    </div>
                )}
            </div>

            <div className="mt-8 flex gap-6">
                <button
                    onClick={handleStart}
                    disabled={!isConnected || isStreaming}
                    className="px-8 py-3 rounded-full bg-white text-black font-bold hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    START STREAM
                </button>
                <button
                    onClick={handleStop}
                    disabled={!isConnected || !isStreaming}
                    className="px-8 py-3 rounded-full bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    STOP STREAM
                </button>
            </div>

            <div className="mt-4 text-xs text-zinc-500 font-mono">
                Status: {isConnected ? 'Connected' : 'Disconnected'} | Streaming: {isStreaming ? 'Active' : 'Idle'}
            </div>
        </main>
    );
}
