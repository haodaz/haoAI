import BusinessKnowledgePage from '@/app/(dashboard)/AIkb/business/page';

export const dynamic = 'force-dynamic';

export default function InternalKnowledgeBaseFilesPage() {
  return (
    <div className="h-[calc(100vh-8rem)] w-full rounded-xl overflow-hidden bg-white shadow-sm border border-gray-100">
      <BusinessKnowledgePage />
    </div>
  );
}
