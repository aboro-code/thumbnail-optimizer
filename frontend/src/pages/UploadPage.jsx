import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, clearToken } from "../lib/api";
import { ALLOWED_TYPES, MAX_FILES, MAX_FILE_SIZE_BYTES, MIN_FILES } from "../lib/uploadLimits";
import ThemeToggle from "../components/ThemeToggle";

function fileProblem(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return "unsupported file type";
  if (file.size > MAX_FILE_SIZE_BYTES) return "larger than 10MB";
  return null;
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [contentTitle, setContentTitle] = useState("");
  const [targetPlatform, setTargetPlatform] = useState("");
  const [candidates, setCandidates] = useState([]); // { file, previewUrl, problem }
  const [error, setError] = useState("");
  const [stage, setStage] = useState(""); // "", "uploading", "scoring"

  useEffect(() => {
    return () => {
      candidates.forEach((c) => URL.revokeObjectURL(c.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(fileList) {
    const next = Array.from(fileList)
      .slice(0, MAX_FILES - candidates.length)
      .map((file) => ({ file, previewUrl: URL.createObjectURL(file), problem: fileProblem(file) }));
    setCandidates((prev) => [...prev, ...next]);
  }

  function removeCandidate(index) {
    setCandidates((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  const validCount = candidates.filter((c) => !c.problem).length;
  const canSubmit = candidates.length >= MIN_FILES && candidates.length <= MAX_FILES && validCount === candidates.length;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setError("");

    const form = new FormData();
    candidates.forEach((c) => form.append("files", c.file));
    if (contentTitle) form.append("content_title", contentTitle);
    if (targetPlatform) form.append("target_platform", targetPlatform);

    try {
      setStage("uploading");
      const uploadRes = await api.post("/thumbnails/upload", form);
      const thumbnailIds = uploadRes.data.thumbnail_ids;

      setStage("scoring");
      const [analyzeRes, detailResponses] = await Promise.all([
        api.post("/predictions/analyze", { thumbnail_ids: thumbnailIds }),
        Promise.all(thumbnailIds.map((id) => api.get(`/thumbnails/${id}`))),
      ]);

      const detailsById = Object.fromEntries(detailResponses.map((r) => [r.data._id, r.data]));
      const items = analyzeRes.data.results
        .map((r) => ({ ...r, ...detailsById[r.thumbnail_id] }))
        .sort((a, b) => a.rank - b.rank);

      navigate("/thumbnails/optimize", {
        state: { items, content_title: contentTitle, target_platform: targetPlatform },
      });
    } catch (err) {
      if (err.response?.status === 401) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }
      if (err.response?.status === 502) {
        setError("The scoring service is unavailable right now. Please try again shortly.");
      } else {
        setError(err.response?.data?.message || "Something went wrong. Please try again.");
      }
      setStage("");
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/dashboard" className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Upload candidates</h1>
        </div>
        <ThemeToggle />
      </header>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="content_title" className="text-sm font-medium">Title or caption (optional)</label>
            <input
              id="content_title"
              type="text"
              value={contentTitle}
              onChange={(e) => setContentTitle(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="target_platform" className="text-sm font-medium">Target platform (optional)</label>
            <input
              id="target_platform"
              type="text"
              placeholder="YouTube, Instagram, TikTok…"
              value={targetPlatform}
              onChange={(e) => setTargetPlatform(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <label htmlFor="files" className="cursor-pointer text-sm">
            <span className="font-medium text-primary">Choose images</span>
            <span className="text-muted-foreground"> or drag them here — {MIN_FILES} to {MAX_FILES} candidates, up to 10MB each</span>
          </label>
          <input
            id="files"
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(",")}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
            className="sr-only"
          />
        </div>

        {candidates.length > 0 && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {candidates.map((c, i) => (
              <li key={c.previewUrl} className="relative overflow-hidden rounded-lg border border-border bg-card">
                <div className="aspect-video w-full bg-muted">
                  <img src={c.previewUrl} alt="" className="h-full w-full object-cover" />
                </div>
                <button
                  type="button"
                  onClick={() => removeCandidate(i)}
                  aria-label={`Remove ${c.file.name}`}
                  className="absolute right-1.5 top-1.5 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium text-foreground hover:bg-destructive hover:text-destructive-foreground"
                >
                  ✕
                </button>
                {c.problem && (
                  <p className="border-t border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                    {c.problem}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          {candidates.length} / {MAX_FILES} selected
          {candidates.length > 0 && candidates.length < MIN_FILES && ` — add at least ${MIN_FILES - candidates.length} more`}
        </p>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit || stage !== ""}
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {stage === "uploading" && "Uploading…"}
          {stage === "scoring" && "Scoring candidates…"}
          {stage === "" && "Upload and score"}
        </button>
      </form>
    </div>
  );
}
