import { PageContainer } from "@/components/shell/page-container";

export default async function Page({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return (
    <PageContainer as="main">
      <h1 className="font-display text-[36px] font-bold text-text-primary">{mint}</h1>
    </PageContainer>
  );
}
