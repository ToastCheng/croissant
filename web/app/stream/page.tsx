'use client';

import { useState, useRef, useEffect } from 'react';
import { FaPlay } from "react-icons/fa6";
import { TbPlayerPauseFilled } from "react-icons/tb";
import { FaCamera } from "react-icons/fa";

// ... imports
export default function StreamPage() {
    const [isConnected, setIsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [firstFrameReceived, setFirstFrameReceived] = useState(false);
    const [mode, setMode] = useState<'on-demand' | 'continuous'>('on-demand');
    const videoRef = useRef<HTMLImageElement>(null);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        // Use current host (port 3000) for both WS (via proxy) and API
        const wsUrl = `${protocol}://${window.location.host}/ws`;

        // Fetch settings first
        fetch('/api/settings')
            .then(res => res.json())
            .then(res => {
                setMode(res.mode);
            })
            .catch(err => console.error("Failed to fetch settings:", err));

        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
            console.log('Connected to Stream Server');
            setIsConnected(true);

            // Check mode and auto-start if needed
            fetch('/api/settings')
                .then(res => res.json())
                .then(res => {
                    setMode(res.mode);
                    if (res.mode === 'continuous') {
                        ws.send('start');
                        setIsStreaming(true);
                        setFirstFrameReceived(false);
                    }
                })
                .catch(err => console.error("Failed to fetch settings:", err));
        };

        // Initial check in case we re-rendered but socket stayed open (though strict mode might close/reopen)
        // This is mainly for UI synchronization
        fetch('/api/settings')
            .then(res => res.json())
            .then(res => setMode(res.mode))
            .catch(err => console.error("Failed to fetch settings:", err));


        ws.onclose = () => {
            console.log('Disconnected from Stream Server');
            setIsConnected(false);
            setIsStreaming(false);
            setFirstFrameReceived(false);
        };

        ws.onmessage = (event) => {
            // Crude handling: Assume each message is a full valid JPEG for this demo
            // In production, we'd need a buffer builder to stitch chunks if they are fragmented
            // For now, if 'image2pipe' flushes well, we might get away with it or see glitches
            const arrayBuffer = event.data;
            const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);

            setFirstFrameReceived(true);

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

    const handleToggleStream = () => {
        if (wsRef.current && isConnected) {
            if (isStreaming) {
                // Stop
                wsRef.current.send('stop');
                setIsStreaming(false);
                setFirstFrameReceived(false);
            } else {
                // Start
                setFirstFrameReceived(false);
                wsRef.current.send('start');
                setIsStreaming(true);
            }
        }
    };

    const handleCaptureFrame = () => {
        if (videoRef.current && videoRef.current.src) {
            const now = new Date();
            // Format YYYYMMDD-HHMMSS
            const pad = (n: number) => n.toString().padStart(2, '0');
            const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

            const a = document.createElement('a');
            a.href = videoRef.current.src;
            a.download = `${timestamp}.jpeg`;
            a.click();
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
                        className={`w-full h-full object-contain ${!firstFrameReceived && isStreaming ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
                    />
                ) : (
                    <div className="text-zinc-500">Connecting to server...</div>
                )}

                {/* Overlay if not streaming but connected */}
                {isConnected && !isStreaming && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
                        <p className="text-xl font-medium">Ready to Stream</p>
                    </div>
                )}

                {/* Visual loading state when streaming started but no frame yet */}
                {isConnected && isStreaming && !firstFrameReceived && (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                            <p className="text-sm text-zinc-400">Initializing Stream...</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-8 flex gap-6">
                <button
                    onClick={handleToggleStream}
                    disabled={!isConnected || mode === 'continuous'}
                    style={{ width: '64px', height: '64px' }}
                    className={`flex items-center justify-center rounded-full font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed
                        ${isStreaming
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-white text-black hover:bg-gray-200'
                        }`}
                    aria-label={isStreaming ? "Stop Stream" : "Start Stream"}
                >
                    {isStreaming ? (
                        <TbPlayerPauseFilled size={24} />
                    ) : (
                        <FaPlay size={24} />
                    )}
                </button>

                <button
                    onClick={handleCaptureFrame}
                    disabled={!isStreaming || !firstFrameReceived}
                    style={{ width: '64px', height: '64px' }}
                    className="flex items-center justify-center rounded-full bg-zinc-800 text-white border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    aria-label="Capture Frame"
                >
                    <FaCamera size={24} />
                </button>
            </div>

            <div className="mt-4 text-xs text-zinc-500 font-mono">
                Status: {isConnected ? 'Connected' : 'Disconnected'} | Streaming: {isStreaming ? 'Active' : 'Idle'}
            </div>
        </main>
    );
}
