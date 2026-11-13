import { api } from "./api";

// The export needs the JWT header, so it's fetched as a blob and saved through a
// temporary object URL rather than a plain <a href>.
export async function downloadReport(abTestId, format) {
  const res = await api.get(`/reports/${abTestId}/export`, { params: { format }, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `abtest-${abTestId}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}
