"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { buildCadenceSlots, formatLocalDueAt } from "@/lib/cadence";
import { defaultPostText, type PublishStatus } from "@/lib/publish-status";
import { useLocale } from "@/i18n/LocaleProvider";

type VideoRow = {
  id: string;
  status: string;
  publicUrl: string | null;
  thumbnailUrl: string | null;
  createdAt?: string;
  publishStatus?: PublishStatus;
  draft: {
    hook: string;
    caption: string;
    hashtags: string[];
  } | null;
};

type Channel = {
  id: string;
  channelId: string;
  displayName: string | null;
  service: string | null;
  accountLabel: string;
};

type Post = {
  id: string;
  text: string;
  mode: string;
  dueAt: string | null;
  status: string;
  bufferPostId: string | null;
  createdAt: string;
};

type PublishFilter = "unposted" | "scheduled" | "posted" | "";
type SortKey = "caption" | "publishStatus" | "createdAt";
type SortDir = "asc" | "desc";

function todayLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDatetimeLocalValue(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SchedulePage() {
  const { t, tf } = useLocale();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<PublishFilter>("unposted");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channelId, setChannelId] = useState("");
  const [text, setText] = useState("");
  const [dueAtLocal, setDueAtLocal] = useState(toDatetimeLocalValue());
  const [startDate, setStartDate] = useState(todayLocalYmd());
  const [postsPerDay, setPostsPerDay] = useState<1 | 2 | 3>(1);
  const [slotTimes, setSlotTimes] = useState<string[]>(["21:00"]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [vRes, cRes, pRes] = await Promise.all([
      fetch("/api/videos"),
      fetch("/api/buffer/channels"),
      fetch("/api/posts"),
    ]);
    const vData = await vRes.json();
    const cData = await cRes.json();
    const pData = await pRes.json();
    const ready = ((vData.videos ?? []) as VideoRow[]).filter(
      (v) => v.status === "ready" && v.publicUrl,
    );
    setVideos(ready);
    setChannels(cData.channels ?? []);
    setPosts(pData.posts ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSlotTimes((prev) => {
      const next = [...prev];
      while (next.length < postsPerDay) {
        next.push(
          next.length === 1 ? "09:00" : next.length === 2 ? "15:00" : "21:00",
        );
      }
      return next.slice(0, postsPerDay);
    });
  }, [postsPerDay]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = videos.filter((v) => {
      const ps = v.publishStatus ?? "unposted";
      if (filter && ps !== filter) return false;
      if (!q) return true;
      const hay = `${v.draft?.hook ?? ""}\n${v.draft?.caption ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

    rows = [...rows].sort((a, b) => {
      let av = "";
      let bv = "";
      if (sortKey === "createdAt") {
        av = a.createdAt ?? "";
        bv = b.createdAt ?? "";
      } else if (sortKey === "publishStatus") {
        av = a.publishStatus ?? "unposted";
        bv = b.publishStatus ?? "unposted";
      } else {
        av = (a.draft?.caption || a.draft?.hook || "").toLowerCase();
        bv = (b.draft?.caption || b.draft?.hook || "").toLowerCase();
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [videos, filter, search, sortKey, sortDir]);

  const selectableIds = useMemo(
    () =>
      visible
        .filter((v) => (v.publishStatus ?? "unposted") === "unposted")
        .map((v) => v.id),
    [visible],
  );

  const allSelectableSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selected.has(id));

  const selectedVideos = useMemo(() => {
    const map = new Map(videos.map((v) => [v.id, v]));
    return [...selected]
      .map((id) => map.get(id))
      .filter((v): v is VideoRow => Boolean(v));
  }, [selected, videos]);

  const schedulableSelected = useMemo(
    () =>
      selectedVideos.filter(
        (v) => (v.publishStatus ?? "unposted") === "unposted",
      ),
    [selectedVideos],
  );

  useEffect(() => {
    if (schedulableSelected.length !== 1) return;
    setText(defaultPostText(schedulableSelected[0].draft));
  }, [schedulableSelected]);

  const previewRows = useMemo(() => {
    if (schedulableSelected.length <= 1) return [];
    try {
      const slots = buildCadenceSlots({
        startDate,
        timesOfDay: slotTimes.slice(0, postsPerDay),
        count: schedulableSelected.length,
      });
      return schedulableSelected.map((v, i) => ({
        video: v,
        dueAt: slots[i],
      }));
    } catch {
      return [];
    }
  }, [schedulableSelected, startDate, slotTimes, postsPerDay]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectableSelected) {
        for (const id of selectableIds) next.delete(id);
      } else {
        for (const id of selectableIds) next.add(id);
      }
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "createdAt" ? "desc" : "asc");
    }
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!channelId) {
      setMessage(t.schedule.needChannel);
      return;
    }
    if (!schedulableSelected.length) {
      setMessage(t.schedule.needVideos);
      return;
    }

    let items: Array<{ videoId: string; text?: string; dueAt: string }>;

    if (schedulableSelected.length === 1) {
      if (!dueAtLocal) {
        setMessage(t.schedule.needDueAt);
        return;
      }
      const due = new Date(dueAtLocal);
      if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) {
        setMessage(t.schedule.needDueAt);
        return;
      }
      items = [
        {
          videoId: schedulableSelected[0].id,
          text: text.trim() || defaultPostText(schedulableSelected[0].draft),
          dueAt: due.toISOString(),
        },
      ];
    } else {
      if (!startDate) {
        setMessage(t.schedule.needStartDate);
        return;
      }
      try {
        const slots = buildCadenceSlots({
          startDate,
          timesOfDay: slotTimes.slice(0, postsPerDay),
          count: schedulableSelected.length,
        });
        items = schedulableSelected.map((v, i) => ({
          videoId: v.id,
          dueAt: slots[i],
        }));
      } catch (err) {
        setMessage(
          err instanceof Error ? err.message : t.schedule.needStartDate,
        );
        return;
      }
    }

    setLoading(true);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, items }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMessage(data.error || "Failed to schedule");
      return;
    }

    const created = data.created ?? data.posts?.length ?? 0;
    const errCount = data.errors?.length ?? 0;
    setMessage(
      tf(t.schedule.success, { count: created }) +
        (errCount ? tf(t.schedule.errors, { count: errCount }) : ""),
    );
    setSelected(new Set());
    await load();
  }

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: 0 }}>{t.schedule.title}</h1>
        <p className="muted">{t.schedule.subtitle}</p>
      </div>

      {message ? <div className="muted">{message}</div> : null}
      {selected.size ? (
        <div className="muted">
          {tf(t.schedule.selectedCount, { count: selected.size })}
        </div>
      ) : null}

      <div className="card row" style={{ gap: "0.75rem" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="label">{t.schedule.filterSearch}</label>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.schedule.filterSearch}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <label className="label">{t.schedule.filterPublish}</label>
          <select
            className="select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as PublishFilter)}
          >
            <option value="">{t.schedule.filterAll}</option>
            <option value="unposted">{t.schedule.filterUnposted}</option>
            <option value="scheduled">{t.schedule.filterScheduled}</option>
            <option value="posted">{t.schedule.filterPosted}</option>
          </select>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th className="col-check">
                <input
                  type="checkbox"
                  checked={allSelectableSelected}
                  onChange={toggleSelectAll}
                  disabled={!selectableIds.length}
                  aria-label={t.schedule.selectAll}
                />
              </th>
              <th
                className="th-sort col-fill"
                onClick={() => toggleSort("caption")}
              >
                {t.schedule.videoColumn}
                {sortMark("caption")}
              </th>
              <th
                className="th-sort col-status"
                onClick={() => toggleSort("publishStatus")}
              >
                {t.status}
                {sortMark("publishStatus")}
              </th>
              <th
                className="th-sort col-date"
                onClick={() => toggleSort("createdAt")}
              >
                {t.created}
                {sortMark("createdAt")}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((v) => {
              const ps = v.publishStatus ?? "unposted";
              const canSelect = ps === "unposted";
              return (
                <tr key={v.id}>
                  <td className="col-check">
                    <input
                      type="checkbox"
                      checked={selected.has(v.id)}
                      disabled={!canSelect}
                      onChange={() => toggle(v.id)}
                      title={
                        canSelect
                          ? undefined
                          : t.schedule.alreadyScheduledHint
                      }
                    />
                  </td>
                  <td className="col-fill">
                    <div className="clamp-2">{v.draft?.hook || v.id}</div>
                  </td>
                  <td className="col-status">
                    <StatusBadge status={ps} />
                  </td>
                  <td
                    className="col-date muted"
                    title={
                      v.createdAt
                        ? new Date(v.createdAt).toLocaleString()
                        : undefined
                    }
                  >
                    {v.createdAt
                      ? new Date(v.createdAt).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                </tr>
              );
            })}
            {!visible.length ? (
              <tr>
                <td colSpan={4} className="muted">
                  {t.schedule.noVideosFilter}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <form className="card stack" onSubmit={onSubmit}>
        <h2 style={{ margin: 0 }}>{t.schedule.scheduleOptions}</h2>

        <div>
          <label className="label">{t.schedule.channel}</label>
          <select
            className="select"
            required
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          >
            <option value="">{t.schedule.selectChannel}</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                [{ch.accountLabel}] {ch.service} —{" "}
                {ch.displayName || ch.channelId}
              </option>
            ))}
          </select>
        </div>

        {schedulableSelected.length === 1 ? (
          <>
            <div>
              <label className="label">{t.schedule.postText}</label>
              <textarea
                className="textarea"
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t.schedule.dueAt}</label>
              <input
                className="input"
                type="datetime-local"
                required
                value={dueAtLocal}
                onChange={(e) => setDueAtLocal(e.target.value)}
              />
            </div>
          </>
        ) : null}

        {schedulableSelected.length > 1 ? (
          <>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {t.schedule.alreadyScheduledHint}
            </p>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="label">{t.schedule.startDate}</label>
                <input
                  className="input"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="label">{t.schedule.postsPerDay}</label>
                <select
                  className="select"
                  value={postsPerDay}
                  onChange={(e) =>
                    setPostsPerDay(Number(e.target.value) as 1 | 2 | 3)
                  }
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {slotTimes.slice(0, postsPerDay).map((time, i) => (
                <div key={i} style={{ flex: 1, minWidth: 120 }}>
                  <label className="label">
                    {tf(t.schedule.slotTime, { n: i + 1 })}
                  </label>
                  <input
                    className="input"
                    type="time"
                    required
                    value={time}
                    onChange={(e) => {
                      const next = [...slotTimes];
                      next[i] = e.target.value;
                      setSlotTimes(next);
                    }}
                  />
                </div>
              ))}
            </div>

            <div>
              <h3 style={{ margin: "0 0 0.5rem" }}>
                {t.schedule.previewTitle}
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t.schedule.previewVideo}</th>
                      <th>{t.schedule.previewDue}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map(({ video, dueAt }) => (
                      <tr key={video.id}>
                        <td>{video.draft?.hook || video.id}</td>
                        <td className="muted">{formatLocalDueAt(dueAt)}</td>
                      </tr>
                    ))}
                    {!previewRows.length ? (
                      <tr>
                        <td colSpan={2} className="muted">
                          {t.schedule.needStartDate}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        {!schedulableSelected.length ? (
          <p className="muted" style={{ margin: 0 }}>
            {t.schedule.needVideos}
          </p>
        ) : null}

        <button
          className="btn"
          type="submit"
          disabled={loading || !schedulableSelected.length}
        >
          {loading
            ? t.schedule.submitting
            : schedulableSelected.length <= 1
              ? t.schedule.submitOne
              : tf(t.schedule.submitMany, {
                  count: schedulableSelected.length,
                })}
        </button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0 }}>{t.schedule.listTitle}</h2>
        <table className="table">
          <thead>
            <tr>
              <th>{t.schedule.text}</th>
              <th>{t.schedule.due}</th>
              <th>{t.status}</th>
              <th>{t.schedule.bufferId}</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td style={{ maxWidth: 320, whiteSpace: "pre-wrap" }}>
                  {p.text.slice(0, 160)}
                  {p.text.length > 160 ? "…" : ""}
                </td>
                <td className="muted">
                  {p.dueAt
                    ? new Date(p.dueAt).toLocaleString()
                    : t.schedule.queue}
                </td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td className="muted">{p.bufferPostId}</td>
              </tr>
            ))}
            {!posts.length ? (
              <tr>
                <td colSpan={4} className="muted">
                  {t.schedule.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
