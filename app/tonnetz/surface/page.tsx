'use client';

import dynamic from 'next/dynamic';

// Adjust import path up two levels
const TonnetzGrid = dynamic(() => import('../../components/2d-grid/TonnetzGrid'), { ssr: false });

export default function SurfacePage() {
    return (
        <main className="w-full h-screen bg-black overflow-hidden">
            {/* 
        Strictly prevent browser back-swipe navigation.
        overscroll-behavior must be on body/html for the document level scroll.
      */}
            <style jsx global>{`
        html, body {
          overscroll-behavior-x: none;
          overscroll-behavior-y: none;
          overflow: hidden;
        }
      `}</style>

            <TonnetzGrid />

            <div className="absolute top-4 left-4 z-10">
                <a href="/tonnetz" className="text-white bg-gray-800 px-4 py-2 rounded">Back to Menu</a>
            </div>
        </main>
    );
}
