"use client";

import { useLocale } from "@/i18n/LocaleProvider";

export function StatusBadge({ status }: { status: string }) {
  const { t } = useLocale();
  const tone =
    status === "ready" ||
    status === "posted" ||
    status === "sent" ||
    status === "approved"
      ? "badge-success"
      : status === "failed"
        ? "badge-danger"
        : status === "generating" ||
            status === "pending" ||
            status === "uploading" ||
            status === "scheduled"
          ? "badge-warning"
          : status === "unposted"
            ? ""
            : "";

  const label =
    status in t.statuses
      ? t.statuses[status as keyof typeof t.statuses]
      : status;

  return <span className={`badge ${tone}`}>{label}</span>;
}
