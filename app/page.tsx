import Image from "next/image";

export default function Home() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center p-24 overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/background.png"
          alt="Smart Home Background"
          fill
          className="object-cover brightness-50"
          priority
        />
      </div>

      {/* Content */}
      <div className="z-10 text-center space-y-8 animate-in fade-in zoom-in duration-1000">
        <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white/90 to-white/50 tracking-tighter drop-shadow-2xl">
          TOAST'S HOME
        </h1>
        <p className="text-xl md:text-2xl text-white/80 font-light tracking-wide max-w-2xl mx-auto">
          Welcome to your personal command center. control your world with style and precision.
        </p>

        <div className="pt-8">
          <button className="px-8 py-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-medium transition-all duration-300 transform hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]">
            Explore Dashboard
          </button>
        </div>
      </div>

      {/* Footer / Status Indicator (Decorational) */}
      <div className="absolute bottom-10 left-0 right-0 z-10 flex justify-center gap-8 text-white/40 text-sm uppercase tracking-widest font-mono">
        <span>System: Online</span>
        <span>•</span>
        <span>Secure Connection</span>
      </div>
    </main>
  );
}
