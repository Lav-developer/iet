"use client";

import { canActOnAccount, canDeactivateAccount } from "@/lib/user-roles";
import { Pencil, UserX } from "lucide-react";

type Actor = { id: string; role: string } | null | undefined;
type Account = { id: string; role: string; active: boolean };

/**
 * Row actions on the Users screen. The same rule the users API enforces
 * decides what is offered: an account the signed-in administrator may not
 * change (a super administrator seen by an IET administrator) gets no Edit or
 * Deactivate button at all — instead of a form whose save the API would refuse.
 */
export function AccountRowActions({ actor, account, onEdit, onDeactivate }: { actor: Actor; account: Account; onEdit: () => void; onDeactivate: () => void }) {
  // Until the session is known nothing is offered; the API re-checks anyway.
  if (!actor) return <span className="small">…</span>;
  if (!canActOnAccount(actor, account)) return <span className="small account-locked">Only a super administrator can change this account.</span>;
  return <div className="entity-actions">
    <button className="mini-button" onClick={onEdit}><Pencil size={13} /> Edit</button>
    {account.active && canDeactivateAccount(actor, account) && <button className="mini-button danger" onClick={onDeactivate}><UserX size={13} /> Deactivate</button>}
  </div>;
}
