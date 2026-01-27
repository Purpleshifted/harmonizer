'use client';

import dynamic from 'next/dynamic';

const TonnetzWalkthrough = dynamic(() => import('../../components/walkthrough/TonnetzWalkthrough'), { ssr: false });

export default function WalkthroughPage() {
    return <TonnetzWalkthrough />;
}
