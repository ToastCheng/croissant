import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 bg-black/50 backdrop-blur-md border-b border-white/10">
      <div className="text-xl font-bold text-white tracking-widest">
        <Link href="/">TOAST'S HOME</Link>
      </div>
      <div className="flex gap-8">
        <Link
          href="/stats"
          className="text-zinc-300 hover:text-white transition-colors duration-200 text-sm font-medium uppercase tracking-wide"
        >
          System
        </Link>
        <Link
          href="/stream"
          className="text-zinc-300 hover:text-white transition-colors duration-200 text-sm font-medium uppercase tracking-wide"
        >
          Stream
        </Link>
        <Link
          href="/replay"
          className="text-zinc-300 hover:text-white transition-colors duration-200 text-sm font-medium uppercase tracking-wide"
        >
          Replay
        </Link>
      </div>
    </nav>
  );
}
