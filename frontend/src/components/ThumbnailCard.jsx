import { Link } from "react-router-dom";

import { API_URL } from "../lib/api";
import StatusPill from "./StatusPill";

// A single frame of film (D-48). The whole card opens the batch this thumbnail
// was uploaded with on the Optimize page (/thumbnails/:id/optimize), scored or not.
export default function ThumbnailCard({ thumbnail: t }) {
  const scored = t.latest_ctr_score !== null && t.latest_ctr_score !== undefined;
  const title = t.content_title || "Untitled";
  return (
    <li className="group">
      <Link
        to={`/thumbnails/${t._id}/optimize`}
        aria-label={`Open ${title} in Optimize`}
        className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div className="film-strip transition-transform duration-200 group-hover:-translate-y-0.5">
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            <img src={`${API_URL}${t.image_url}`} alt="" loading="lazy" className="h-full w-full object-cover" />
            {scored && (
              <span className="loupe loupe-sm absolute right-2 top-2">
                <span className="sr-only">Predicted score </span>
                {Math.round(t.latest_ctr_score)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-start justify-between gap-2 px-1 pt-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold group-hover:text-primary">{title}</p>
            <p className="text-xs text-muted-foreground">
              Uploaded {new Date(t.uploaded_at).toLocaleDateString()}
              {t.target_platform ? `, for ${t.target_platform}` : ""}
            </p>
          </div>
          <StatusPill status={t.status} />
        </div>
      </Link>
    </li>
  );
}
