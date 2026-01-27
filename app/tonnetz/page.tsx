import Link from "next/link";

export default function TonnetzMenu() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-8">
            <Link href="/" className="absolute top-8 left-8 text-zinc-500 hover:text-white transition-colors">
                &larr; Back to Home
            </Link>

            <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500">
                Tonnetz Mode
            </h1>
            <p className="text-zinc-400 mb-12">Select a visualization topology</p>

            <div className="flex flex-col gap-4 w-full max-w-md">
                <Link
                    href="/tonnetz/surface"
                    className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:bg-zinc-800 hover:border-zinc-700 transition-all flex items-center justify-between group"
                >
                    <div>
                        <h3 className="font-semibold text-lg text-zinc-200 group-hover:text-cyan-300">2D Surface</h3>
                        <p className="text-sm text-zinc-500">Flat standard grid visualization (Phase 1)</p>
                    </div>
                    <span className="text-zinc-600 group-hover:text-white">&rarr;</span>
                </Link>

                <Link
                    href="/tonnetz/torus"
                    className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:bg-zinc-800 hover:border-zinc-700 transition-all flex items-center justify-between group"
                >
                    <div>
                        <h3 className="font-semibold text-lg text-zinc-200 group-hover:text-purple-300">Global Torus</h3>
                        <p className="text-sm text-zinc-500">Seamless infinite loop on a 3D donut</p>
                    </div>
                    <span className="text-zinc-600 group-hover:text-white">&rarr;</span>
                </Link>

                <Link
                    href="/tonnetz/walkthrough"
                    className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:bg-zinc-800 hover:border-zinc-700 transition-all flex items-center justify-between group"
                >
                    <div>
                        <h3 className="font-semibold text-lg text-zinc-200 group-hover:text-green-300">Walkthrough</h3>
                        <p className="text-sm text-zinc-500">First-person infinite exploration</p>
                    </div>
                    <span className="text-zinc-600 group-hover:text-white">&rarr;</span>
                </Link>
            </div>
        </div>
    );
}
