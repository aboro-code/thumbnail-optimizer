import { Link } from "react-router-dom";

import { API_URL } from "../lib/api";
import StatusPill from "./StatusPill";

// The whole card opens the batch this thumbnail was uploaded with on the
// Optimize page (/thumbnails/:id/optimize), scored or not.
export default function ThumbnailCard({ thumbnail: t }) {
  const scored = t.latest_ctr_score !== null && t.latest_ctr_score !== undefined;
  const title = t.content_title || "Untitled";
  return (
    <li className="overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary focus-within:border-primary">
      <Link
        to={`/thumbnails/${t._id}/optimize`}
        aria-label={`Open ${title} in Optimize`}
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div className="relative aspect-video w-full bg-muted">
          <img
            src={`${API_URL}${t.image_url}`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
          {scored && (
            <span className="absolute left-2 top-2 rounded-full bg-[color-mix(in_srgb,var(--background)_90%,transparent)] px-2 py-0.5 font-mono text-xs font-semibold tabular-nums">
              <span className="sr-only">Predicted score </span>
              {t.latest_ctr_score.toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(t.uploaded_at).toLocaleDateString()}
              {t.target_platform ? ` · ${t.target_platform}` : ""}
            </p>
          </div>
          <StatusPill status={t.status} />
        </div>
      </Link>
    </li>
  );
}
