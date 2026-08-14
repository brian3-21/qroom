import SalaClient from "@/components/SalaClient";

export default async function SalaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <SalaClient code={code} />;
}