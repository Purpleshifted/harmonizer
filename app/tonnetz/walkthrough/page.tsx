'use client';

import React from 'react';
import Link from 'next/link';

export default function WalkthroughSelectionPage() {
    return (
        <div className="w-full h-screen bg-black flex flex-col items-center justify-center text-white font-sans">
            <h1 className="text-4xl font-light mb-12 tracking-wider">Tonnetz Walkthrough Mode</h1>

            <div className="flex gap-8">
                {/* Visual Sandbox Card */}
                <Link href="/tonnetz/walkthrough/visual" className="group relative">
                    <div className="w-64 h-80 border border-blue-500/50 rounded-xl p-6 hover:bg-blue-900/10 transition flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition duration-500" />
                        <div className="text-5xl mb-6 group-hover:scale-110 transition duration-300 relative z-10">✨</div>
                        <h2 className="text-2xl font-bold mb-4 relative z-10">Visual Sandbox</h2>
                        <p className="text-sm text-center text-gray-400 relative z-10">
                            Experimental visuals.
                            Leva controls enabled.
                        </p>
                    </div>
                </Link>

                {/* Unified Mode Card */}
                <Link href="/tonnetz/walkthrough/unified" className="group">
                    <div className="w-64 h-80 border border-purple-500/50 rounded-xl p-6 hover:bg-purple-900/10 transition flex flex-col items-center justify-center">
                        <div className="text-5xl mb-6 group-hover:scale-110 transition duration-300">🔮</div>
                        <h2 className="text-2xl font-bold mb-4">Unified Mode</h2>
                        <p className="text-sm text-center text-gray-400">
                            Merge target.
                            Combines audio and visuals.
                        </p>
                    </div>
                </Link>
            </div>

            <div className="mt-16 text-gray-600 text-sm">
                Select a mode to begin.
            </div>

            {/* Exit Link */}
            <Link href="/tonnetz" className="mt-8 text-gray-500 hover:text-white transition text-xs uppercase tracking-widest">
                ← Exit to Menu
            </Link>
        </div>
    );
}
