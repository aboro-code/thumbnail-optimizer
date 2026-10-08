// Mirrors backend/src/middleware/upload.js - client-side pre-check only.
// The backend remains the source of truth (it also verifies actual file bytes).
export const MIN_FILES = 2;
export const MAX_FILES = 10;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
