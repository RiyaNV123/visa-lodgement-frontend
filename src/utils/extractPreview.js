import client from "../api/client.js";

// Runs the same extraction a real upload always did, but against bytes that
// are never saved anywhere (see POST /cases/extract-preview) -- no S3
// write, no Sheets write, no case/course needing to exist yet. Shared by
// CaseNew.jsx (fires the moment a file is attached) and CaseDetail.jsx's
// review screen (re-checked there for any file whose first attempt hadn't
// resolved yet by the time Save was clicked).
export async function extractPreview(docType, file) {
  try {
    const form = new FormData();
    form.append("doc_type", docType);
    form.append("file", file);
    const res = await client.post("/cases/extract-preview", form, { headers: { "Content-Type": "multipart/form-data" } });
    return res.data;
  } catch {
    return {}; // resolved, just nothing found -- distinct from "still pending" (undefined)
  }
}
