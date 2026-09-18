import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityManager } from "@/components/entity-manager";
import { isEntityName } from "@/lib/content-policy";
import type { EntityName } from "@/lib/types";

export default async function AdminEntityPage({ params }: { params: Promise<{ entity: string }> }) { const { entity } = await params; if (!isEntityName(entity)) notFound(); return <><div style={{ marginBottom: 20 }}><Link href="/admin" className="link-arrow">Back to dashboard</Link></div><EntityManager entity={entity as EntityName} /></>; }
