import { notFound } from "next/navigation";
import { getSolution } from "@/lib/solutions/registry";
import { ModulePending } from "./pending";

export default async function Page({ params }: PageProps<"/solutions/[slug]">) {
  const { slug } = await params;
  const meta = getSolution(slug);
  if (!meta) notFound();
  return <ModulePending slug={slug} />;
}
