import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Image from 'next/image';

export default function LoginPage() {
    async function login(formData: FormData) {
        'use server';

        const password = formData.get('password');
        const correctPassword = process.env.PASSWORD;

        if (password === correctPassword) {
            const cookieStore = await cookies();
            cookieStore.set('auth_session', 'true', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                maxAge: 60 * 60 * 24 * 7, // 1 week
            });
            redirect('/');
        } else {
            redirect('/login?error=Invalid password');
        }
    }

    return (
        <main className="relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden">
            {/* Background Image - Matching Home Page */}
            <div className="absolute inset-0 z-0">
                <Image
                    src="/background.png"
                    alt="Background"
                    fill
                    className="object-cover brightness-50"
                    priority
                />
            </div>

            <div className="z-10 w-full max-w-md animate-in fade-in zoom-in duration-700">
                <div className="p-8 rounded-2xl bg-black/30 backdrop-blur-xl border border-white/10 shadow-2xl">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white/90 to-white/50 tracking-tight">
                            AUTHENTICATION
                        </h1>
                        <p className="text-white/60 text-sm mt-2 font-light tracking-wide">
                            Please identify yourself to proceed.
                        </p>
                    </div>

                    <form action={login} className="space-y-6">
                        <div className="space-y-2">
                            <input
                                type="password"
                                name="password"
                                placeholder="Enter access code"
                                required
                                className="w-full px-5 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:bg-white/10 focus:border-white/30 transition-all text-center tracking-widest"
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full py-3.5 rounded-xl bg-white text-black font-bold tracking-wide hover:bg-gray-200 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-white/20"
                        >
                            Unlock Terminal
                        </button>
                    </form>

                    {/* Decorational Footer */}
                    <div className="mt-8 flex justify-center gap-4 text-white/20 text-xs uppercase tracking-[0.2em] font-mono">
                        <span>Secure</span>
                        <span>•</span>
                        <span>Encrypted</span>
                    </div>
                </div>
            </div>
        </main>
    );
}
