const BADGE_STYLES = {
  uploaded: "bg-[#dff3e3] text-[#126b2f]",
  pending: "bg-[#e9e8e5] text-[#5f6670]",
  ready: "bg-[#eaf1fb] text-[#2d5fa1]",
};

// Saved documents remain read-only. Pending documents can be chosen, previewed
// and removed directly in the final summary before one batch save.
export default function DocUploadSlot({ label, required, document, pendingFile, onSelectFile, onRemovePendingFile }) {
  const uploaded = Boolean(document);
  const ready = Boolean(pendingFile);

  function previewLocalFile() {
    const url = URL.createObjectURL(pendingFile);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="min-w-0 rounded-lg border border-[#c2c7ce]/50 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium font-label text-[#1a1c1a]">
          {label}
          {required && <span className="ml-1 text-[#b42318]">*</span>}
        </p>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${BADGE_STYLES[uploaded ? "uploaded" : ready ? "ready" : "pending"]}`}
        >
          {uploaded ? "Uploaded" : ready ? "Ready" : "Pending"}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-[#72777e]">
        {uploaded ? document.file_name : ready ? pendingFile.name : required ? "Required" : "Optional"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {uploaded && (
          <a
            href={document.drive_view_link}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-[#c2c7ce] bg-white px-3 py-2 text-xs font-semibold text-[#002d48] shadow-sm hover:bg-[#f4f3f1]"
          >
            Preview
          </a>
        )}
        {!uploaded && !ready && (
          <label className="cursor-pointer rounded-lg border border-[#c2c7ce] bg-white px-3 py-2 text-xs font-semibold text-[#002d48] shadow-sm hover:bg-[#f4f3f1]">
            Upload
            <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={onSelectFile} />
          </label>
        )}
        {!uploaded && ready && (
          <>
            <button
              type="button"
              onClick={previewLocalFile}
              className="rounded-lg border border-[#c2c7ce] bg-white px-3 py-2 text-xs font-semibold text-[#002d48] shadow-sm hover:bg-[#f4f3f1]"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={onRemovePendingFile}
              className="text-xs font-semibold text-[#b42318] hover:underline"
            >
              Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}
