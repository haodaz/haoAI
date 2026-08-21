'use client';

import BusinessKnowledgePage from '@/app/(dashboard)/AIkb/business/page';

export const dynamic = 'force-dynamic';

export default function AgencyKbPage() {
  return (
    <div className="h-[calc(100vh-8rem)] w-full rounded-xl overflow-hidden bg-white shadow-sm">
      <BusinessKnowledgePage />
    </div>
  );
}
