"use client";

import { useCan } from "@/lib/useSession";
import { useI18n } from "@/lib/i18n";
import { S } from "@/components/ui";

// "← Staff & Roles" link back to the Admin screen. Only Super Admins see it
// (managers and coordinators can't open /admin, so they never get the link).
export default function AdminLink() {
  const { tr } = useI18n();
  const isAdmin = useCan("staff.manage");
  if (!isAdmin) return null;
  return <a href="/admin" style={S.nav}>← {tr("Staff & Roles")}</a>;
}
