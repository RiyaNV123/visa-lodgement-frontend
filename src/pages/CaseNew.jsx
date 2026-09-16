import { useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { extractPreview } from "../utils/extractPreview.js";

const COURSE_TYPES = [
  { value: "certificate", label: "Certificate" },
  { value: "diploma", label: "Diploma" },
  { value: "bachelors", label: "Bachelors" },
  { value: "masters", label: "Masters" },
];
const STREAMS = [
  {
    value: "vocational",
    title: "Post Vocational 485",
    subtitle: "Certificate / Diploma",
    courseTypes: ["certificate", "diploma"],
  },
  {
    value: "higher",
    title: "Post Higher 485",
    subtitle: "Bachelors / Masters",
    courseTypes: ["bachelors", "masters"],
  },
];
const TYPE_LABEL = Object.fromEntries(COURSE_TYPES.map((t) => [t.value, t.label]));

const DOC_FIELDS = [
  { key: "coe", label: "CoE", required: false },
  { key: "completion_letter", label: "Completion Letter", required: true },
  { key: "transcript", label: "Transcript", required: true },
  { key: "academic_certificate", label: "Academic Certificate", required: false },
];

// Case-level documents -- one per case, not one per qualification. Current
// Visa/PTE/OVHC are each individually required; AFP Certificate and AFP
// Receipt are an either-or pair (only one needs to exist); New CoE is fully
// optional (it's only ever relevant to the separate lodgement-date check).
const CASE_DOC_FIELDS = [
  { key: "current_visa", label: "Current Visa", required: true },
  { key: "pte", label: "PTE", required: true },
  { key: "ovhc", label: "OVHC", required: true },
  { key: "afp_certificate", label: "AFP Certificate", required: false },
  { key: "afp_receipt", label: "AFP Receipt", required: false },
  { key: "new_coe", label: "New CoE", required: false },
];
function emptyCaseFiles() {
  return Object.fromEntries(CASE_DOC_FIELDS.map((field) => [field.key, null]));
}

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 15 * 1024 * 1024;
const EXTENSION_FOR_TYPE = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png" };

function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return "Only PDF, JPG, or PNG files are allowed";
  if (file.size > MAX_BYTES) return "File exceeds 15MB limit";
  return null;
}

function emptyDraft(stream = "vocational") {
  const streamDefinition = STREAMS.find((item) => item.value === stream);
  return {
    courseType: streamDefinition.courseTypes[0],
    files: { coe: null, completion_letter: null, transcript: null, academic_certificate: null },
    // Keyed the same as files; a key absent/undefined means "not yet
    // resolved" (still extracting or nothing picked), an empty object means
    // "resolved, nothing found" -- see describeExtracted/extractPreview.
    extracted: {},
  };
}

// Assigns "Certificate 1", "Diploma 1", "Diploma 2", ... consistent with how
// the backend courses will actually be named on submit.
function buildLabels(qualifications) {
  const counts = {};
  return qualifications.map((q) => {
    counts[q.courseType] = (counts[q.courseType] || 0) + 1;
    return `${TYPE_LABEL[q.courseType]} ${counts[q.courseType]}`;
  });
}

function DocPickerField({ field, file, error, onPick, onRemove }) {
  // Extraction still runs in the background the moment a file is attached
  // (see pickFile/pickCaseFile below) -- it's just not shown here anymore.
  // The result surfaces later, all together, on the review screen right
  // after Save (see ExtractedDetailsReview in CaseDetail.jsx).
  function previewFile() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[#c2c7ce]/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium font-label text-[#1a1c1a]">
          {field.label}
          {field.required && <span className="ml-1 text-[#b42318]">*</span>}
        </p>
        {file ? (
          <p className="truncate text-xs text-[#2d5fa1]">{file.name}</p>
        ) : (
          <p className="text-xs text-[#72777e]">{field.required ? "Required" : "Optional"}</p>
        )}
        {error && <p className="text-xs text-[#b42318]">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {file && (
          <>
            <button
              type="button"
              onClick={previewFile}
              className="rounded-lg border border-[#c2c7ce] bg-white px-3 py-2 text-xs font-semibold text-[#002d48] shadow-sm hover:bg-[#f4f3f1]"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-xs font-semibold text-[#b42318] hover:underline"
            >
              Remove
            </button>
          </>
        )}
        {!file && (
          <label className="cursor-pointer rounded-lg border border-[#c2c7ce] bg-white px-3 py-2 text-xs font-semibold text-[#002d48] shadow-sm hover:bg-[#f4f3f1]">
            Choose file
            <input type="file" accept={ALLOWED_TYPES.join(",")} className="hidden" onChange={onPick} />
          </label>
        )}
      </div>
    </div>
  );
}

export default function CaseNew({ onCreated, existingCaseId = null }) {
  const { user } = useAuth();
  const [stream, setStream] = useState("vocational");
  const [qualifications, setQualifications] = useState([]);
  // Case-level documents (Current Visa/PTE/OVHC/AFP/New CoE) are only
  // collected here for a genuinely new case -- when changing stream for an
  // existing case, PUT /cases/{id}/replace only ever touches qualifications
  // (see cases_router.py), so these documents (if already uploaded) are
  // untouched and re-collecting them here would risk a confusing duplicate-
  // document error or an unnecessary re-upload prompt.
  const collectCaseDocs = !existingCaseId;
  const [caseFiles, setCaseFiles] = useState(() => emptyCaseFiles());
  // Same "absent = still pending, {} = resolved but nothing found" shape as
  // a qualification's draft.extracted.
  const [caseExtracted, setCaseExtracted] = useState({});
  const [caseFieldErrors, setCaseFieldErrors] = useState({});
  const [mode, setMode] = useState("list"); // "list" | "form" | "preview"
  const [draft, setDraft] = useState(emptyDraft());
  const [editingIndex, setEditingIndex] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function startAdd() {
    setDraft(emptyDraft(stream));
    setFieldErrors({});
    setEditingIndex(null);
    setMode("form");
  }

  function startEdit(index) {
    const qualification = qualifications[index];
    setDraft({ ...qualification, files: { ...qualification.files }, extracted: { ...(qualification.extracted || {}) } });
    setFieldErrors({});
    setEditingIndex(index);
    setMode("form");
  }

  // Course types are stream-specific, so an existing qualification list
  // isn't valid across a stream switch -- cleared the same way "Change
  // stream / start again" already resets everything today. Case-level
  // documents aren't stream-dependent, so they're left untouched.
  function changeStream(newStream) {
    setStream(newStream);
    setQualifications([]);
  }

  function pickFile(key, e) {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    const err = validateFile(file);
    setFieldErrors((prev) => ({ ...prev, [key]: err || undefined }));
    if (err) return;
    setDraft((prev) => {
      const { [key]: _drop, ...restExtracted } = prev.extracted;
      return { ...prev, files: { ...prev.files, [key]: file }, extracted: restExtracted };
    });
    // Fired the instant the file is attached -- not gated on Preview/Save.
    // Guarded against the file having since been removed/replaced (editing
    // a different qualification, or swapping this exact slot) by checking
    // it's still the same File reference when this resolves.
    extractPreview(key, file).then((result) => {
      setDraft((prev) => (prev.files[key] === file ? { ...prev, extracted: { ...prev.extracted, [key]: result } } : prev));
    });
  }

  function removeFile(key) {
    setDraft((prev) => {
      const { [key]: _drop, ...restExtracted } = prev.extracted;
      return { ...prev, files: { ...prev.files, [key]: null }, extracted: restExtracted };
    });
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function pickCaseFile(key, e) {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    const err = validateFile(file);
    setCaseFieldErrors((prev) => ({ ...prev, [key]: err || undefined }));
    if (err) return;
    setCaseFiles((prev) => ({ ...prev, [key]: file }));
    setCaseExtracted((prev) => {
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
    extractPreview(key, file).then((result) => {
      setCaseFiles((current) => {
        if (current[key] === file) setCaseExtracted((prev) => ({ ...prev, [key]: result }));
        return current;
      });
    });
  }

  function removeCaseFile(key) {
    setCaseFiles((prev) => ({ ...prev, [key]: null }));
    setCaseExtracted((prev) => {
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
    setCaseFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleDone() {
    setQualifications((prev) =>
      editingIndex === null ? [...prev, draft] : prev.map((qualification, index) => (index === editingIndex ? draft : qualification))
    );
    setEditingIndex(null);
    setMode("list");
  }

  function removeQualification(index) {
    setQualifications((prev) => prev.filter((_, i) => i !== index));
  }

  // Neither creating the case nor uploading its documents happens here --
  // both are the slow part (a real Google Sheets round-trip each), and
  // making the student sit through them before they can even see the next
  // screen is exactly the wait we're removing. Package up everything the
  // next screen needs and hand off immediately; it creates the case (and
  // uploads the files' actual bytes) in the background while already fully
  // interactive. Qualifications don't have real course ids yet, so pending
  // files are keyed by their position instead -- the next screen re-keys
  // them by real document id once the case actually exists. Case-level
  // files use the same "case:<doc_type>" key the next screen already
  // understands.
  //
  // A brand-new case (no existingCaseId) goes through create-full: every
  // qualification/case document has already been extracted (see
  // extractPreview above, fired the instant each file was attached), so
  // the whole case -- dates, CRICOS code/weeks, visa/PTE/OVHC/AFP fields,
  // and every document's metadata -- gets created in ONE batched call
  // instead of the old one-Sheets-write-per-document drip (see
  // create_case_full in cases_router.py for why that matters). Changing
  // stream on an EXISTING case still goes through the old replace flow
  // unchanged for now -- narrower, less common, and not worth the added
  // risk of also rewriting PUT /cases/{id}/replace in the same pass.
  function handleSubmit() {
    const labels = buildLabels(qualifications);
    const pendingFiles = {};
    qualifications.forEach((q, i) => {
      DOC_FIELDS.forEach((field) => {
        const file = q.files[field.key];
        if (file) pendingFiles[`${i}:${field.key}`] = file;
      });
    });
    if (collectCaseDocs) {
      CASE_DOC_FIELDS.forEach((field) => {
        const file = caseFiles[field.key];
        if (file) pendingFiles[`case:${field.key}`] = file;
      });
    }

    if (existingCaseId) {
      const courses = qualifications.map((q, i) => ({ name: labels[i], course_type: q.courseType, sort_order: i }));
      const payload = { student_name: user.full_name, stream, courses };
      onCreated?.({ payload, isFull: false, existingCaseId }, pendingFiles);
      return;
    }

    // Keys (same "0:coe" / "case:current_visa" shape as pendingFiles) whose
    // extraction hadn't resolved yet at the moment Save was clicked -- the
    // review screen re-checks exactly these (it still has the same File
    // objects, via pendingFiles) and shows them as loading in the meantime,
    // rather than showing a possibly-wrong "not detected" for something
    // that just hasn't had time to finish yet.
    const pendingExtractionKeys = [];

    const courses = qualifications.map((q, i) => {
      const cl = q.extracted?.completion_letter || {};
      const coe = q.extracted?.coe || {};
      if (q.files.completion_letter && q.extracted?.completion_letter === undefined) pendingExtractionKeys.push(`${i}:completion_letter`);
      if (q.files.coe && q.extracted?.coe === undefined) pendingExtractionKeys.push(`${i}:coe`);
      const documents = DOC_FIELDS.filter((field) => q.files[field.key]).map((field) => ({
        doc_type: field.key,
        file_name: `${labels[i]} - ${field.label}${EXTENSION_FOR_TYPE[q.files[field.key].type] || ""}`,
        mime_type: q.files[field.key].type,
      }));
      return {
        name: labels[i],
        course_type: q.courseType,
        start_date: cl.start_date || null,
        end_date: cl.end_date || null,
        cricos_code: coe.cricos_code || null,
        cricos_weeks: coe.cricos_weeks ?? null,
        sort_order: i,
        documents,
      };
    });

    const caseDocuments = CASE_DOC_FIELDS.filter((field) => caseFiles[field.key]).map((field) => ({
      doc_type: field.key,
      file_name: `${field.label}${EXTENSION_FOR_TYPE[caseFiles[field.key].type] || ""}`,
      mime_type: caseFiles[field.key].type,
    }));
    CASE_DOC_FIELDS.forEach((field) => {
      if (caseFiles[field.key] && caseExtracted[field.key] === undefined) pendingExtractionKeys.push(`case:${field.key}`);
    });
    const visa = caseExtracted.current_visa || {};
    const pte = caseExtracted.pte || {};
    const ovhc = caseExtracted.ovhc || {};
    const afp = caseExtracted.afp_certificate || {};
    const afpReceipt = caseExtracted.afp_receipt || {};
    const newCoe = caseExtracted.new_coe || {};

    const payload = {
      student_name: user.full_name,
      stream,
      courses,
      case_documents: caseDocuments,
      visa_subclass: visa.visa_subclass || null,
      visa_length_of_stay_date: visa.visa_length_of_stay_date || null,
      pte_valid_until_date: pte.pte_valid_until_date || null,
      ovhc_relevant_date: ovhc.ovhc_relevant_date || null,
      afp_issue_date: afp.afp_issue_date || afpReceipt.afp_issue_date || null,
      new_coe_start_date: newCoe.new_coe_start_date || null,
    };
    onCreated?.({ payload, isFull: true, existingCaseId: null, pendingExtractionKeys }, pendingFiles);
  }

  const allowedCourseTypes = STREAMS.find((item) => item.value === stream).courseTypes;

  if (mode === "form") {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="font-headline text-4xl font-bold tracking-tight text-[#002d48]">
            {editingIndex === null ? "Add Qualification" : "Edit Qualification"}
          </h1>

          <div className="rounded-xl bg-white p-6 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#72777e]">
              Type of course
            </label>
            <select
              value={draft.courseType}
              onChange={(e) => setDraft((prev) => ({ ...prev, courseType: e.target.value }))}
              className="mt-1 w-full max-w-xs rounded-lg border border-[#c2c7ce] bg-white px-3 py-2 text-sm focus:border-[#004384] focus:outline-none"
            >
              {COURSE_TYPES.filter((t) => allowedCourseTypes.includes(t.value)).map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DOC_FIELDS.map((field) => (
                <DocPickerField
                  key={field.key}
                  field={field}
                  file={draft.files[field.key]}
                  error={fieldErrors[field.key]}
                  onPick={(e) => pickFile(field.key, e)}
                  onRemove={() => removeFile(field.key)}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode("list")}
              className="rounded-lg border border-[#c2c7ce] bg-white px-6 py-3 text-sm font-bold font-headline text-[#002d48] shadow-sm hover:bg-[#f4f3f1]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="rounded-lg bg-[#002d48] px-6 py-3 text-sm font-bold font-headline text-white shadow-sm hover:bg-[#004384]"
            >
              Done
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  const labels = buildLabels(qualifications);
  const allRequiredQualDocsAttached = qualifications.every((qualification) =>
    DOC_FIELDS.filter((field) => field.required).every((field) => Boolean(qualification.files[field.key]))
  );
  const allRequiredCaseDocsAttached =
    !collectCaseDocs ||
    (Boolean(caseFiles.current_visa) &&
      Boolean(caseFiles.pte) &&
      Boolean(caseFiles.ovhc) &&
      (Boolean(caseFiles.afp_certificate) || Boolean(caseFiles.afp_receipt)));
  const canPreview = qualifications.length > 0 && allRequiredQualDocsAttached && allRequiredCaseDocsAttached;

  if (mode === "preview") {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="font-headline text-4xl font-bold tracking-tight text-[#002d48]">Review your documents</h1>
            <p className="mt-1 text-sm font-medium text-[#42474d]">
              Check every file before saving everything to Drive.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {qualifications.map((qualification, index) => (
              <section
                key={index}
                className="rounded-xl bg-white p-5 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]"
              >
                <h2 className="font-headline text-lg font-bold text-[#002d48]">{labels[index]}</h2>
                <div className="mt-4 space-y-2">
                  {DOC_FIELDS.map((field) => {
                    const file = qualification.files[field.key];
                    return (
                      <div key={field.key} className="flex items-center justify-between gap-3 rounded-lg bg-[#f4f3f1] px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#1a1c1a]">
                            {field.label}{field.required && <span className="ml-1 text-[#b42318]">*</span>}
                          </p>
                          <p className="truncate text-xs text-[#72777e]">{file ? file.name : "Pending"}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${file ? "bg-[#dff3e3] text-[#126b2f]" : "bg-[#e9e8e5] text-[#5f6670]"}`}>
                          {file ? "Ready" : "Pending"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {collectCaseDocs && (
              <section className="rounded-xl bg-white p-5 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
                <h2 className="font-headline text-lg font-bold text-[#002d48]">Additional Documents</h2>
                <div className="mt-4 space-y-2">
                  {CASE_DOC_FIELDS.map((field) => {
                    const file = caseFiles[field.key];
                    return (
                      <div key={field.key} className="flex items-center justify-between gap-3 rounded-lg bg-[#f4f3f1] px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#1a1c1a]">
                            {field.label}{field.required && <span className="ml-1 text-[#b42318]">*</span>}
                          </p>
                          <p className="truncate text-xs text-[#72777e]">{file ? file.name : "Pending"}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${file ? "bg-[#dff3e3] text-[#126b2f]" : "bg-[#e9e8e5] text-[#5f6670]"}`}>
                          {file ? "Ready" : "Pending"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setMode("list")}
              className="rounded-lg border border-[#c2c7ce] bg-white px-6 py-3 text-sm font-bold font-headline text-[#002d48] shadow-sm hover:bg-[#f4f3f1]"
            >
              Back to edit
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center gap-2 rounded-lg bg-[#002d48] px-6 py-3 text-sm font-bold font-headline text-white shadow-sm hover:bg-[#004384]"
            >
              Save
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="font-headline text-4xl font-bold tracking-tight text-[#002d48]">
            Your Documents
          </h1>
          <p className="mt-1 text-sm font-medium text-[#42474d]">
            Choose your stream, add each completed qualification with its documents{collectCaseDocs ? ", attach your additional documents" : ""}, then preview and submit.
          </p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
          <label className="text-[10px] font-bold uppercase tracking-widest text-[#72777e]">485 Stream</label>
          <select
            value={stream}
            onChange={(e) => changeStream(e.target.value)}
            className="mt-1 w-full max-w-xs rounded-lg border border-[#c2c7ce] bg-white px-3 py-2 text-sm focus:border-[#004384] focus:outline-none"
          >
            {STREAMS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.title} ({item.subtitle})
              </option>
            ))}
          </select>
          {existingCaseId && (
            <p className="mt-3 rounded-lg border-l-4 border-[#ff8f37] bg-[#fff3d6] px-4 py-3 text-xs text-[#42474d]">
              You are changing your stream. Your current qualifications will be replaced only after you add the new
              qualifications and submit them.
            </p>
          )}
          {qualifications.length > 0 && (
            <p className="mt-3 text-xs text-[#72777e]">
              Switching stream clears the qualifications below, since their course types belong to the previous
              stream.
            </p>
          )}
        </div>

        {qualifications.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#c2c7ce] bg-white px-6 py-8 text-center text-sm text-[#72777e]">
            No qualifications added yet.
          </p>
        ) : (
          <div className="space-y-3">
            {qualifications.map((q, i) => {
              const docCount = Object.values(q.files).filter(Boolean).length;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl bg-white p-4 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]"
                >
                  <div>
                    <p className="text-sm font-bold font-headline text-[#002d48]">{labels[i]}</p>
                    <p className="text-xs text-[#72777e]">{docCount} of 4 documents attached</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => startEdit(i)}
                      className="text-xs font-semibold text-[#2d5fa1] hover:underline"
                    >
                      Edit files
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQualification(i)}
                      className="text-xs font-semibold text-[#b42318] hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={startAdd}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#c2c7ce] bg-white px-6 py-4 text-sm font-semibold text-[#002d48] hover:border-[#004384]"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Add Qualification
        </button>

        {!allRequiredQualDocsAttached && qualifications.length > 0 && (
          <p className="text-xs text-[#8a5b00]">
            Add a Completion Letter and Transcript for every qualification before previewing. CoE and Academic Certificate remain optional.
          </p>
        )}

        {collectCaseDocs && (
          <div className="rounded-xl bg-white p-6 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
            <p className="text-lg font-bold font-headline text-[#002d48]">Additional Documents</p>
            <p className="mt-1 text-xs text-[#72777e]">
              A current AFP Certificate or AFP Receipt is fine — you don't need both. New CoE is optional and only
              relevant if you're already enrolled in a next course.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CASE_DOC_FIELDS.map((field) => (
                <DocPickerField
                  key={field.key}
                  field={field}
                  file={caseFiles[field.key]}
                  error={caseFieldErrors[field.key]}
                  onPick={(e) => pickCaseFile(field.key, e)}
                  onRemove={() => removeCaseFile(field.key)}
                />
              ))}
            </div>
          </div>
        )}

        {existingCaseId && (
          <p className="text-xs text-[#72777e]">
            Submitting replaces your previous qualifications and their in-app document links. Existing Drive files
            remain safely stored in the case folder.
          </p>
        )}

        <button
          type="button"
          onClick={() => setMode("preview")}
          disabled={!canPreview}
          className="w-full rounded-lg bg-[#002d48] px-6 py-3 text-sm font-bold font-headline text-white shadow-sm hover:bg-[#004384] disabled:opacity-50"
        >
          Preview documents
        </button>
      </div>
    </AppShell>
  );
}
