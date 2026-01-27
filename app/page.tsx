import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-8">
      <h1 className="text-4xl font-bold mb-12 tracking-tight">Harmonizer</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Slot 1: Tonnetz */}
        <Link
          href="/tonnetz"
          className="group block p-6 border border-zinc-800 rounded-2xl hover:bg-zinc-900 transition-all hover:scale-105"
        >
          <h2 className="text-2xl font-semibold mb-2 group-hover:text-cyan-400 transition-colors">Tonnetz Grid &rarr;</h2>
          <p className="text-zinc-400">Explore musical space on infinite geometric surfaces.</p>
        </Link>

        {/* Placeholder Slots */}
        <div className="p-6 border border-zinc-900 rounded-2xl bg-zinc-950/50 opacity-50 cursor-not-allowed">
          <h2 className="text-2xl font-semibold mb-2 text-zinc-600">Sequencer</h2>
          <p className="text-zinc-700">Coming Soon</p>
        </div>

        <div className="p-6 border border-zinc-900 rounded-2xl bg-zinc-950/50 opacity-50 cursor-not-allowed">
          <h2 className="text-2xl font-semibold mb-2 text-zinc-600">Synthesizer</h2>
          <p className="text-zinc-700">Coming Soon</p>
        </div>
      </div>
    </div>
  );
}
