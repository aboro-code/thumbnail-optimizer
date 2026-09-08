const SIGNATURES = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

function matchesWebp(buffer) {
  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

function detectImageMime(buffer) {
  for (const { mime, bytes } of SIGNATURES) {
    if (buffer.length >= bytes.length && bytes.every((byte, i) => buffer[i] === byte)) {
      return mime;
    }
  }
  if (matchesWebp(buffer)) {
    return "image/webp";
  }
  return null;
}

module.exports = { detectImageMime };
