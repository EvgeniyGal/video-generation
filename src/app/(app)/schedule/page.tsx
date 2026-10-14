"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DateTimeFields, TimeField } from "@/components/DateTimeFields";
import { StatusBadge } from "@/components/StatusBadge";
import {
  buildCadenceSlots,
  datetimeLocalInZoneToIso,
  formatLocalDueAt,
  guessBrowserTimeZone,
  listTimeZones,
} from "@/lib/cadence";
import { filterChannelsForMedia } from "@/lib/buffer-media-support";
import { defaultPostText, type PublishStatus } from "@/lib/publish-status";
import { useLocale } from "@/i18n/LocaleProvider";

type VideoRow = {
  id: string;
  status: string;
  provider?: string | null;
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

type CarouselRow = {
  id: string;
  status: string;
  slideUrls: string[];
  createdAt?: string;
  publishStatus?: PublishStatus;
  draft: {
    hook: string;
    caption: string;
    hashtags: string[];
  } | null;
};

type MediaKind = "videos" | "carousels";

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

function toDatetimeLocalValue(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultCadenceStartAt(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(0);
  d.setHours(21);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return toDatetimeLocalValue(d);
}

function splitDatetimeLocal(value: string): { date: string; time: string } | null {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) return null;
  return { date: m[1], time: m[2] };
}

export default function SchedulePage() {
  const { t, tf } = useLocale();
  const [mediaKind, setMediaKind] = useState<MediaKind>("videos");
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [carouselRows, setCarouselRows] = useState<CarouselRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<PublishFilter>("unposted");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(
    new Set(),
  );
  const [text, setText] = useState("");
  const [dueAtLocal, setDueAtLocal] = useState(toDatetimeLocalValue());
  const [timeZone, setTimeZone] = useState(guessBrowserTimeZone);
  const [startAtLocal, setStartAtLocal] = useState(defaultCadenceStartAt);
  const [postsPerDay, setPostsPerDay] = useState<1 | 2 | 3>(1);
  const [extraSlotTimes, setExtraSlotTimes] = useState<string[]>([
    "09:00",
    "15:00",
  ]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timeZones = useMemo(() => listTimeZones(), []);

  const cadenceTimesOfDay = useMemo(() => {
    const split = splitDatetimeLocal(startAtLocal);
    if (!split) return [] as string[];
    const times = [split.time];
    if (postsPerDay >= 2) times.push(extraSlotTimes[0] || "09:00");
    if (postsPerDay >= 3) times.push(extraSlotTimes[1] || "15:00");
    return times;
  }, [startAtLocal, postsPerDay, extraSlotTimes]);

  const cadenceStartDate = useMemo(
    () => splitDatetimeLocal(startAtLocal)?.date ?? "",
    [startAtLocal],
  );

  const load = useCallback(async () => {
    const [vRes, carRes, cRes, pRes] = await Promise.all([
      fetch("/api/videos"),
      fetch("/api/carousels"),
      fetch("/api/buffer/channels"),
      fetch("/api/posts"),
    ]);
    const vData = await vRes.json();
    const carData = await carRes.json();
    const cData = await cRes.json();
    const pData = await pRes.json();
    const ready = ((vData.videos ?? []) as VideoRow[]).filter(
      (v) => v.status === "ready" && v.publicUrl,
    );
    const readyCarousels = ((carData.carousels ?? []) as CarouselRow[]).filter(
      (c) => c.status === "ready" && c.slideUrls?.length,
    );
    setVideos(ready);
    setCarouselRows(readyCarousels);
    setChannels(cData.channels ?? []);
    setPosts(pData.posts ?? []);
  }, []);

  useEffect(() => {
    setSelected(new Set());
  }, [mediaKind]);

  useEffect(() => {
    load();
  }, [load]);

  const mediaItems = mediaKind === "videos" ? videos : carouselRows;

  const carouselImageCountNeeded = useMemo(() => {
    if (mediaKind !== "carousels") return undefined;
    const selectedCarousels = carouselRows.filter((c) => selected.has(c.id));
    if (!selectedCarousels.length) return undefined; // default ≥2 in filter helper
    return Math.max(...selectedCarousels.map((c) => c.slideUrls.length));
  }, [mediaKind, carouselRows, selected]);

  const applicableChannels = useMemo(
    () =>
      filterChannelsForMedia(channels, {
        kind: mediaKind === "carousels" ? "carousel" : "video",
        imageCount: carouselImageCountNeeded,
      }),
    [channels, mediaKind, carouselImageCountNeeded],
  );

  useEffect(() => {
    const allowed = new Set(applicableChannels.map((c) => c.id));
    setSelectedChannels((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [applicableChannels]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = mediaItems.filter((v) => {
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
  }, [mediaItems, filter, search, sortKey, sortDir]);

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

  const selectedMedia = useMemo(() => {
    const map = new Map(mediaItems.map((v) => [v.id, v]));
    return [...selected]
      .map((id) => map.get(id))
      .filter((v): v is VideoRow | CarouselRow => Boolean(v));
  }, [selected, mediaItems]);

  const schedulableSelected = useMemo(
    () =>
      selectedMedia.filter(
        (v) => (v.publishStatus ?? "unposted") === "unposted",
      ),
    [selectedMedia],
  );

  useEffect(() => {
    if (schedulableSelected.length !== 1) return;
    setText(defaultPostText(schedulableSelected[0].draft));
  }, [schedulableSelected]);

  const previewRows = useMemo(() => {
    if (schedulableSelected.length <= 1) return [];
    if (!cadenceStartDate || !cadenceTimesOfDay.length) return [];
    try {
      const slots = buildCadenceSlots({
        startDate: cadenceStartDate,
        timesOfDay: cadenceTimesOfDay,
        count: schedulableSelected.length,
        timeZone,
      });
      return schedulableSelected.map((v, i) => ({
        item: v,
        dueAt: slots[i],
      }));
    } catch {
      return [];
    }
  }, [
    schedulableSelected,
    cadenceStartDate,
    cadenceTimesOfDay,
    timeZone,
  ]);

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

    if (!selectedChannels.size) {
      setMessage(t.schedule.needChannel);
      return;
    }
    if (!timeZone) {
      setMessage(t.schedule.needTimeZone);
      return;
    }
    if (!schedulableSelected.length) {
      setMessage(t.schedule.needVideos);
      return;
    }

    let items: Array<{
      videoId?: string;
      carouselId?: string;
      text?: string;
      dueAt: string;
    }>;

    const toItem = (id: string, dueAt: string, text?: string) =>
      mediaKind === "carousels"
        ? { carouselId: id, dueAt, text }
        : { videoId: id, dueAt, text };

    if (schedulableSelected.length === 1) {
      if (!dueAtLocal) {
        setMessage(t.schedule.needDueAt);
        return;
      }
      let dueIso: string;
      try {
        dueIso = datetimeLocalInZoneToIso(dueAtLocal, timeZone);
      } catch {
        setMessage(t.schedule.needDueAt);
        return;
      }
      const due = new Date(dueIso);
      if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) {
        setMessage(t.schedule.needDueAt);
        return;
      }
      items = [
        toItem(
          schedulableSelected[0].id,
          dueIso,
          text.trim() || defaultPostText(schedulableSelected[0].draft),
        ),
      ];
    } else {
      if (!cadenceStartDate || !cadenceTimesOfDay.length) {
        setMessage(t.schedule.needStartDate);
        return;
      }
      try {
        const slots = buildCadenceSlots({
          startDate: cadenceStartDate,
          timesOfDay: cadenceTimesOfDay,
          count: schedulableSelected.length,
          timeZone,
        });
        items = schedulableSelected.map((v, i) => toItem(v.id, slots[i]));
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
      body: JSON.stringify({
        channelIds: [...selectedChannels],
        items,
      }),
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

  function toggleChannel(id: string) {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const postCountEstimate =
    schedulableSelected.length * Math.max(selectedChannels.size, 0);

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: 0 }}>{t.schedule.title}</h1>
        <p className="muted">{t.schedule.subtitle}</p>
      </div>

      {message ? <div className="muted">{message}</div> : null}

      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className={mediaKind === "videos" ? "btn" : "btn btn-secondary"}
          onClick={() => setMediaKind("videos")}
        >
          {t.schedule.mediaVideos}
        </button>
        <button
          type="button"
          className={mediaKind === "carousels" ? "btn" : "btn btn-secondary"}
          onClick={() => setMediaKind("carousels")}
        >
          {t.schedule.mediaCarousels}
        </button>
      </div>

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
                    {mediaKind === "videos" &&
                    "provider" in v &&
                    v.provider === "custom" ? (
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {t.videos.providerCustom}
                      </div>
                    ) : null}
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
          <div className="muted" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
            {t.schedule.channelsHint}
          </div>
          <div
            className="muted"
            style={{ fontSize: "0.8rem", marginBottom: 8 }}
          >
            {t.schedule.channelsFilteredHint}
          </div>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              maxHeight: 220,
              overflow: "auto",
            }}
          >
            {applicableChannels.map((ch) => (
              <label
                key={ch.id}
                className="row"
                style={{
                  gap: 10,
                  padding: "0.65rem 0.75rem",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  alignItems: "flex-start",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedChannels.has(ch.id)}
                  onChange={() => toggleChannel(ch.id)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong>
                    {ch.service || "channel"} — {ch.displayName || ch.channelId}
                  </strong>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {ch.accountLabel}
                  </div>
                </span>
              </label>
            ))}
            {!channels.length ? (
              <div className="muted" style={{ padding: "0.75rem" }}>
                {t.schedule.selectChannel}
              </div>
            ) : !applicableChannels.length ? (
              <div className="muted" style={{ padding: "0.75rem" }}>
                {t.schedule.channelsNoneCompatible}
              </div>
            ) : null}
          </div>
          <div className="muted" style={{ fontSize: "0.85rem", marginTop: 6 }}>
            {tf(t.schedule.channelsSelected, {
              count: selectedChannels.size,
            })}
          </div>
        </div>

        <div>
          <label className="label">{t.schedule.timeZone}</label>
          <div className="muted" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
            {t.schedule.timeZoneHint}
          </div>
          <select
            className="select"
            required
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
          >
            {timeZones.map((z) => (
              <option key={z} value={z}>
                {z}
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
            <DateTimeFields
              required
              value={dueAtLocal}
              onChange={setDueAtLocal}
              dateLabel={t.schedule.dueDate}
              timeLabel={t.schedule.dueTime}
            />
          </>
        ) : null}

        {schedulableSelected.length > 1 ? (
          <>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {t.schedule.alreadyScheduledHint}
            </p>
            <DateTimeFields
              required
              value={startAtLocal}
              onChange={setStartAtLocal}
              dateLabel={t.schedule.startAtDate}
              timeLabel={t.schedule.startAtTime}
            />
            <div style={{ maxWidth: 220 }}>
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
            {postsPerDay > 1 ? (
              <div className="row" style={{ flexWrap: "wrap" }}>
                {Array.from({ length: postsPerDay - 1 }, (_, idx) => (
                  <TimeField
                    key={idx}
                    required
                    label={tf(t.schedule.slotTime, { n: idx + 2 })}
                    value={extraSlotTimes[idx] || "09:00"}
                    onChange={(next) => {
                      const copy = [...extraSlotTimes];
                      copy[idx] = next;
                      setExtraSlotTimes(copy);
                    }}
                  />
                ))}
              </div>
            ) : null}

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
                    {previewRows.map(({ item, dueAt }) => (
                      <tr key={item.id}>
                        <td>{item.draft?.hook || item.id}</td>
                        <td className="muted">
                          {formatLocalDueAt(dueAt, timeZone)}
                        </td>
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
          disabled={
            loading ||
            !schedulableSelected.length ||
            !selectedChannels.size
          }
        >
          {loading
            ? t.schedule.submitting
            : postCountEstimate <= 1
              ? t.schedule.submitOne
              : tf(t.schedule.submitMany, { count: postCountEstimate })}
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
