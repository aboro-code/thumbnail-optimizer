const PDFDocument = require("pdfkit");
const sharp = require("sharp");

const { readUploadedImage } = require("./abtestReport");

const CSV_COLUMNS = [
  "ab_test_id",
  "content_reference",
  "status",
  "start_date",
  "end_date",
  "variant",
  "variant_id",
  "thumbnail_title",
  "image_url",
  "predicted_ctr_score",
  "predicted_rank",
  "impressions",
  "clicks",
  "measured_ctr",
  "is_winner",
  "is_predicted_winner",
  "prediction_matched_winner",
  "explanation_signals",
  "explanation_text",
];

// A cell starting with = + - @ (or a tab/CR) is run as a formula by Excel/Sheets,
// so user-supplied text like a thumbnail title is prefixed with ' (CSV injection).
function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(report) {
  const rows = report.variants.map((v) => [
    report.ab_test_id,
    report.content_reference,
    report.status,
    report.start_date,
    report.end_date,
    v.label,
    v.variant_id,
    v.thumbnail_title,
    v.image_url,
    v.predicted_ctr_score,
    v.predicted_rank,
    v.impressions,
    v.clicks,
    v.measured_ctr,
    v.is_winner,
    v.is_predicted_winner,
    report.prediction_matched_winner,
    v.explanation_signals.join("; "),
    v.explanation_text,
  ]);
  return [CSV_COLUMNS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const IMAGE_BOX = { width: 160, height: 120 };

// PDFKit only embeds JPEG/PNG, and uploads may be WebP, so every image is
// re-encoded as PNG and fitted inside IMAGE_BOX.
async function loadImageForPdf(imageUrl) {
  const raw = await readUploadedImage(imageUrl);
  if (!raw) return null;
  try {
    return await sharp(raw)
      .resize(IMAGE_BOX.width * 2, IMAGE_BOX.height * 2, { fit: "inside" })
      .png()
      .toBuffer();
  } catch (err) {
    return null;
  }
}

function formatDate(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : "-";
}

function formatPercent(fraction) {
  return `${(fraction * 100).toFixed(2)}%`;
}

function matchText(matched) {
  if (matched === true) return "Yes, the AI's top pick won";
  if (matched === false) return "No, a different variant won";
  return "Unknown (test not completed, or a variant was never scored)";
}

async function toPdf(report) {
  const images = await Promise.all(report.variants.map((v) => loadImageForPdf(v.image_url)));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `A/B test report ${report.ab_test_id}` } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    doc.font("Helvetica-Bold").fontSize(20).text("A/B Test Report");
    doc.font("Helvetica").fontSize(9).fillColor("#555555")
      .text(`Thumbnail Optimizer - generated ${report.generated_at.toISOString().replace("T", " ").slice(0, 16)} UTC`);
    doc.moveDown();

    const winner = report.variants.find((v) => v.is_winner);
    const predicted = report.variants.find((v) => v.is_predicted_winner);
    const summary = [
      ["Content", report.content_reference],
      ["Status", report.status],
      ["Test window", `${formatDate(report.start_date)} to ${formatDate(report.end_date)}`],
      ["Winner (highest measured CTR)", winner ? winner.label : "Not declared yet"],
      ["AI's predicted winner", predicted ? predicted.label : "Unknown (a variant was never scored)"],
      ["Prediction correct", matchText(report.prediction_matched_winner)],
    ];
    doc.fillColor("#000000").fontSize(10);
    for (const [label, value] of summary) {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(String(value));
    }
    doc.moveDown();

    report.variants.forEach((v, idx) => {
      const blockHeight = IMAGE_BOX.height + 30;
      if (doc.y + blockHeight > doc.page.height - doc.page.margins.bottom) doc.addPage();

      const top = doc.y;
      doc.moveTo(left, top).lineTo(left + width, top).strokeColor("#cccccc").stroke();

      const imageTop = top + 10;
      if (images[idx]) {
        doc.image(images[idx], left, imageTop, { fit: [IMAGE_BOX.width, IMAGE_BOX.height] });
      } else {
        doc.rect(left, imageTop, IMAGE_BOX.width, IMAGE_BOX.height).strokeColor("#999999").stroke();
        doc.fontSize(8).fillColor("#777777")
          .text("Image unavailable", left, imageTop + IMAGE_BOX.height / 2 - 4, { width: IMAGE_BOX.width, align: "center" });
      }

      const textLeft = left + IMAGE_BOX.width + 15;
      const textWidth = width - IMAGE_BOX.width - 15;
      const badges = [v.is_winner && "WINNER", v.is_predicted_winner && "AI PICK"].filter(Boolean).join("  ·  ");

      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(12)
        .text(`${v.label}${v.thumbnail_title ? ` - ${v.thumbnail_title}` : ""}`, textLeft, imageTop, { width: textWidth });
      if (badges) doc.fillColor("#b91c1c").fontSize(9).text(badges, { width: textWidth });

      doc.fillColor("#000000").font("Helvetica").fontSize(10);
      const score = v.predicted_ctr_score === null ? "not scored" : `${v.predicted_ctr_score} / 100 (rank ${v.predicted_rank})`;
      doc.text(`Predicted score: ${score}`, { width: textWidth });
      doc.text(`Impressions: ${v.impressions}   Clicks: ${v.clicks}   Measured CTR: ${formatPercent(v.measured_ctr)}`, { width: textWidth });
      if (v.explanation_signals.length) doc.text(`Signals: ${v.explanation_signals.join(", ")}`, { width: textWidth });
      if (v.explanation_text) doc.fillColor("#444444").fontSize(9).text(v.explanation_text, { width: textWidth });

      doc.x = left;
      doc.y = Math.max(doc.y, imageTop + IMAGE_BOX.height) + 15;
    });

    doc.end();
  });
}

module.exports = { toCsv, toPdf, csvCell, CSV_COLUMNS };
