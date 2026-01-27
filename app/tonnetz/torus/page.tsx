'use client';

import dynamic from 'next/dynamic';

const TonnetzTorus = dynamic(() => import('../../components/TonnetzTorus'), { ssr: false });

export default function TorusPage() {
    return <TonnetzTorus />;
}
