import type { Metadata } from "next";
import SalaClient from "@/components/SalaClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Sala ${code.toUpperCase()} · Qroom`,
  };
}

export default async function SalaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <SalaClient code={code} />;
}