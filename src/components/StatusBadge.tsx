export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ready" || status === "posted" || status === "sent" || status === "approved"
      ? "badge-success"
      : status === "failed"
        ? "badge-danger"
        : status === "generating" || status === "pending" || status === "uploading"
          ? "badge-warning"
          : "";

  return <span className={`badge ${tone}`}>{status}</span>;
}
