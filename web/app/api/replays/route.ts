import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const res = await fetch('http://localhost:8080/api/replays', {
            cache: 'no-store'
        });
        if (!res.ok) {
            throw new Error(`Failed to fetch replays: ${res.status}`);
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Proxy error:", error);
        return NextResponse.json({ error: 'Failed to fetch replays' }, { status: 500 });
    }
}
