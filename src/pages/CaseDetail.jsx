import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import client, { errorMessage } from "../api/client.js";
import AppShell from "../components/AppShell.jsx";
import DocUploadSlot from "../components/DocUploadSlot.jsx";
import Spinner, { PageLoader } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const STREAM_LABEL = { vocational: "Post Vocational 485", higher: "Post Higher 485" };

// Shown, one at a time, inside any column that hasn't resolved yet -- purely
// to keep a waiting student engaged, not tied to real backend progress (the
// columns themselves already reveal each real result the instant it's
// ready, independently of this).
const LOADING_MESSAGES = [
  "Great things take a moment — thanks for your patience.",
  "Your 485 journey is almost at the next step.",
  "We're making sure everything checks out, just for you.",
  "Good news is worth the wait.",
];
const LOADING_MESSAGE_INTERVAL_MS = 4500;

// One shared panel covering whichever column(s) haven't resolved yet -- not
// three separate per-column loaders. Checks always resolve left-to-right
// (qualification, then document validity, then lodgement date), so the
// still-loading columns are always a contiguous trailing block; this panel
// takes their place in the grid (via `span`) and shrinks as each one
// finishes and reveals its own real card instead, right next to it.
function SharedLoadingPanel({ span, messageIndex }) {
  const spanClass = span === 3 ? "lg:col-span-3" : span === 2 ? "lg:col-span-2" : "lg:col-span-1";
  return (
    <div
      className={`flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-[#c2c7ce]/40 bg-white/60 p-10 text-center backdrop-blur-sm ${spanClass}`}
    >
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#2d5fa1] border-t-transparent" />
      <p key={messageIndex} className="animate-message-fade mt-4 max-w-[260px] text-sm font-medium text-[#42474d]">
        {LOADING_MESSAGES[messageIndex]}
      </p>
    </div>
  );
}

// Same rounding rule the backend uses (actual_weeks in eligibility.py) --
// shown here purely for display, so a course's own row matches the number
// that fed into its group's total below.
function weeksBetween(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  return Math.round(ms / (1000 * 60 * 60 * 24 * 7));
}

const DOC_SLOTS = [
  { doc_type: "coe", label: "CoE", required: false },
  { doc_type: "completion_letter", label: "Completion Letter", required: true },
  { doc_type: "transcript", label: "Transcript", required: true },
  { doc_type: "academic_certificate", label: "Academic Certificate", required: false },
];

const CASE_DOC_SLOTS = [
  { doc_type: "current_visa", label: "Current Visa", required: true },
  { doc_type: "afp_certificate", label: "AFP Certificate", required: false },
  { doc_type: "afp_receipt", label: "AFP Receipt", required: false },
  { doc_type: "pte", label: "PTE", required: true },
  { doc_type: "ovhc", label: "OVHC", required: true },
];

function ReviewField({ label, value, attached }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f4f3f1] px-3 py-2">
      <span className="text-xs font-semibold text-[#1a1c1a]">{label}</span>
      <span className="text-xs text-[#42474d]">{!attached ? "Not attached" : value || "Not detected"}</span>
    </div>
  );
}

// Shown right after Save, before any eligibility check runs -- reads
// straight from the payload the student just submitted (see CaseNew.jsx's
// handleSubmit), which already carries whatever extract-preview found for
// each document. No backend call needed to render this: the case is being
// created in the background at the same time, so this gives the student
// something real to check immediately instead of a wait. Clicking Next only
// flips a local flag (see reviewConfirmed in CaseDetail); the actual
// eligibility check waits for both that click and the case actually
// existing, whichever comes last.
function ExtractedDetailsReview({ payload, onNext }) {
  const attachedCaseDocTypes = new Set((payload.case_documents || []).map((d) => d.doc_type));

  return (
    <div className="space-y-6">
      <div>
        <p className="font-headline text-2xl font-bold text-[#002d48]">Here's what we found</p>
        <p className="mt-2 text-sm font-medium text-[#42474d]">
          We've pulled these details out of the documents you attached — take a moment to check them over. Your case
          is being saved in the background, so results will be ready shortly after you continue.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {payload.courses.map((course, index) => (
          <div key={index} className="rounded-xl bg-white p-5 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
            <div className="flex items-center justify-between">
              <p className="font-headline text-lg font-bold text-[#002d48]">{course.name}</p>
              <span className="rounded-full bg-[#f4f3f1] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5f6670]">
                {course.course_type}
              </span>
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-[#72777e]">Dates</dt>
                <dd className="font-semibold text-[#1a1c1a]">
                  {course.start_date && course.end_date ? `${course.start_date} to ${course.end_date}` : "Not detected"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#72777e]">CRICOS</dt>
                <dd className="font-semibold text-[#1a1c1a]">
                  {course.cricos_code ? `${course.cricos_code}${course.cricos_weeks != null ? ` · ${course.cricos_weeks} wks` : ""}` : "Not detected"}
                </dd>
              </div>
            </dl>
            {(!course.start_date || !course.end_date || !course.cricos_code) && (
              <p className="mt-2 text-xs text-[#8a5b00]">
                Some details weren't picked up automatically — that's fine, an admin can add them by hand.
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
        <p className="font-headline text-lg font-bold text-[#002d48]">Additional Documents</p>
        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ReviewField
            label="Current Visa"
            value={payload.visa_subclass && payload.visa_length_of_stay_date ? `Subclass ${payload.visa_subclass}, valid to ${payload.visa_length_of_stay_date}` : null}
            attached={attachedCaseDocTypes.has("current_visa")}
          />
          <ReviewField label="PTE" value={payload.pte_valid_until_date ? `Valid until ${payload.pte_valid_until_date}` : null} attached={attachedCaseDocTypes.has("pte")} />
          <ReviewField label="OVHC" value={payload.ovhc_relevant_date ? `Relevant date ${payload.ovhc_relevant_date}` : null} attached={attachedCaseDocTypes.has("ovhc")} />
          <ReviewField
            label="AFP (Certificate or Receipt)"
            value={payload.afp_issue_date ? `Issued ${payload.afp_issue_date}` : null}
            attached={attachedCaseDocTypes.has("afp_certificate") || attachedCaseDocTypes.has("afp_receipt")}
          />
          {attachedCaseDocTypes.has("new_coe") && (
            <ReviewField label="New CoE" value={payload.new_coe_start_date ? `Starts ${payload.new_coe_start_date}` : null} attached />
          )}
        </dl>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-lg bg-[#002d48] px-6 py-3 text-sm font-bold font-headline text-white shadow-sm hover:bg-[#004384] sm:w-auto"
      >
        Next
      </button>
    </div>
  );
}

// Placeholder case shown the instant the qualifications screen hands off --
// the real case doesn't exist on the server yet (that's created in the
// background, see the creatingCase effect below), so this is built purely
// from what the student already entered, using the qualification's position
// as a stand-in course id until the real one comes back.
function buildPlaceholderCase({ payload }) {
  return {
    id: null,
    student_name: payload.student_name,
    stream: payload.stream,
    status: "draft",
    owner_email: null,
    eligibility_status: "pending",
    eligibility_reason: null,
    total_duration_weeks: null,
    duration_breakdown: null,
    document_validity_status: "pending",
    document_validity_reason: null,
    document_validity_breakdown: null,
    lodgement_date_status: "pending",
    lodgement_date_reason: null,
    lodgement_date: null,
    lodgement_basis: null,
    lodgement_breakdown: null,
    courses: payload.courses.map((course, index) => ({
      id: String(index),
      name: course.name,
      course_type: course.course_type,
      start_date: null,
      end_date: null,
      cricos_weeks: null,
      sort_order: course.sort_order,
      documents: [],
    })),
    documents: [],
  };
}

export default function CaseDetail({ caseId, pendingCreate, initialPendingFiles }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const [caseData, setCaseData] = useState(() => (pendingCreate ? buildPlaceholderCase(pendingCreate) : null));
  const [creatingCase, setCreatingCase] = useState(Boolean(pendingCreate));
  const [creatingError, setCreatingError] = useState("");
  const [loading, setLoading] = useState(!pendingCreate);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingFiles, setPendingFiles] = useState(initialPendingFiles || {});
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  // Document validity (current visa/PTE/OVHC/AFP) is a completely separate
  // check from qualification eligibility above -- its own trigger, its own
  // result, its own details section, never merged into one verdict.
  const [checkingDocumentValidity, setCheckingDocumentValidity] = useState(false);
  // Lodgement date calculation -- a third independent check. Its only
  // dependency on the others: it only ever runs once the qualification and
  // document validity checks are already "eligible" (see the auto-run effect
  // and selectNewCoeDocument below).
  const [checkingLodgementDate, setCheckingLodgementDate] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  // Admins review every document on one page, always. Students no longer go
  // through separate qualifications/additional-documents screens -- every
  // document is collected up front on the CaseNew.jsx builder before a case
  // even exists, so a student always lands straight on the results view.
  // "qualifications"/"additional" remain reachable states purely so an
  // admin's view (which ignores `step` entirely -- see showQualifications/
  // showAdditional below) keeps working unchanged.
  const [step] = useState("submitted"); // "qualifications" | "additional" | "submitted"
  // Gates the results screen behind a "here's what we found" review step,
  // shown only right after a brand-new case is created (isFull) -- not on a
  // later revisit (no pendingCreate then), and not for a stream-change
  // (extraction isn't collected for that flow). Reading straight from
  // pendingCreate.payload -- the exact data the student already
  // provided -- means this can render instantly, with no wait of its own;
  // the real case-creation work keeps happening in the background while
  // they read it, so clicking Next often finds it already done.
  const [reviewConfirmed, setReviewConfirmed] = useState(!pendingCreate || !pendingCreate.isFull);
  const caseCreationStarted = useRef(false);
  const autoCheckStarted = useRef(false);

  // Each column is "loading" independently -- while its own check is
  // actively in flight, or while it's genuinely never been checked yet (see
  // the same "pending status with no reason at all" signal the auto-run
  // effect below uses). A column that's already resolved to a real
  // verdict -- including a gated "pending" with an actual reason -- is not
  // loading, even while a *later* column still is.
  const eligibilityLoading = checkingEligibility || (caseData?.eligibility_status === "pending" && !caseData?.eligibility_reason);
  const documentValidityLoading = checkingDocumentValidity || (caseData?.document_validity_status === "pending" && !caseData?.document_validity_reason);
  const lodgementLoading = checkingLodgementDate || (caseData?.lodgement_date_status === "pending" && !caseData?.lodgement_date_reason);
  const anyColumnLoading = eligibilityLoading || documentValidityLoading || lodgementLoading;
  // How many trailing columns still need the shared loader -- always a
  // contiguous count from the right, since a later check never resolves
  // before an earlier one starts (see the auto-run effect below).
  const loadingSpan = [eligibilityLoading, documentValidityLoading, lodgementLoading].filter(Boolean).length;

  // Cycles the engaging loading message every few seconds, only while at
  // least one column actually needs it -- purely to keep a waiting student
  // company, not tied to real progress (see LOADING_MESSAGES above).
  useEffect(() => {
    if (!anyColumnLoading) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((current) => (current + 1) % LOADING_MESSAGES.length);
    }, LOADING_MESSAGE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [anyColumnLoading]);
  const pendingFilesRef = useRef(pendingFiles);
  // Tracks which pendingFiles keys currently have an upload in flight, so
  // two batches for genuinely different files (e.g. the qualifications
  // batch and the additional-documents batch) can run concurrently without
  // one silently swallowing the other -- only a call that targets a key
  // that's already uploading gets skipped.
  const inFlightKeysRef = useRef(new Set());

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  function fileKey(courseId, docType) {
    return `${courseId}:${docType}`;
  }

  function attachFile(key, file) {
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setActionError("Only PDF, JPG, or PNG files are allowed.");
      return false;
    }
    if (file.size > 15 * 1024 * 1024) {
      setActionError("File exceeds the 15MB limit.");
      return false;
    }
    setActionError("");
    setPendingFiles((current) => ({ ...current, [key]: file }));
    return true;
  }

  function detachFile(key) {
    setPendingFiles((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function selectPendingFile(courseId, docType, event) {
    const file = event.target.files?.[0];
    if (file) attachFile(fileKey(courseId, docType), file);
  }

  function removePendingFile(courseId, docType) {
    detachFile(fileKey(courseId, docType));
  }

  function selectCaseDocument(docType, event) {
    const file = event.target.files?.[0];
    if (file) attachFile(`case:${docType}`, file);
  }

  function removeCaseDocument(docType) {
    detachFile(`case:${docType}`);
  }

  // New CoE lives in its own section (alongside the lodgement date result,
  // not the Additional Documents screen) with no "N ready to save" bar of
  // its own, so selecting a file uploads it immediately instead of waiting
  // for a separate save action. There's no "Recheck Lodgement Date" button
  // anymore (every check runs on its own), so this is also the only trigger
  // that re-runs the checks after a New CoE is added -- only if the other
  // two are already eligible, matching the same gate runChecks enforces
  // server-side. Stages 1/2 recompute quickly (nothing new to re-extract),
  // stage 3 picks up the fresh new_coe_start_date.
  async function selectNewCoeDocument(event) {
    const file = event.target.files?.[0];
    if (file && attachFile("case:new_coe", file)) {
      await uploadFiles({ "case:new_coe": file });
      if (caseData?.eligibility_status === "eligible" && caseData?.document_validity_status === "eligible") {
        runChecks();
      }
    }
  }

  // Re-fetches the case WITHOUT the page-level loading flag, so the page
  // never blanks out to a spinner while this runs -- unlike `load` below,
  // which is only for the very first mount fetch.
  const refreshCaseData = useCallback(
    (idOverride) => {
      const id = idOverride ?? caseData?.id;
      if (!id) return Promise.resolve();
      return client
        .get(`/cases/${id}`)
        .then((res) => setCaseData(res.data))
        .catch(() => {});
    },
    [caseData?.id]
  );

  // Uploads a given set of files entirely in the background, all at once --
  // no spinner, no "Saving..." label anywhere, and no one-at-a-time trickle
  // either: every file in the batch fires together, and badges flip from
  // Ready to Uploaded as a group once the whole batch settles. Never awaited
  // by a caller that's about to move the student on, so it never blocks or
  // delays anything else in the UI. `overrides` lets the just-created-case
  // codepath pass the fresh case id straight through instead of waiting on
  // state to settle. Only files not already mid-upload (from some other,
  // concurrently-running batch) are actually sent -- e.g. the qualifications
  // batch and the additional-documents batch can be in flight at the same
  // time without one dropping the other, since they never touch the same
  // keys; a call that's entirely made up of already-in-flight keys is a
  // no-op rather than re-sending duplicates.
  async function uploadFiles(filesMap, overrides = {}) {
    const uploads = Object.entries(filesMap).filter(([key]) => !inFlightKeysRef.current.has(key));
    if (!uploads.length) return;
    const effectiveCaseId = overrides.caseId ?? caseData?.id;
    if (!effectiveCaseId) return;
    uploads.forEach(([key]) => inFlightKeysRef.current.add(key));
    setActionError("");
    try {
      const results = await Promise.allSettled(
        uploads.map(([key, file]) => {
          const [scope, docType] = key.split(":");
          const isCaseDoc = scope === "case";
          const form = new FormData();
          form.append("doc_type", docType);
          form.append("file", file);
          const url = isCaseDoc
            ? `/cases/${effectiveCaseId}/documents`
            : `/cases/${effectiveCaseId}/courses/${scope}/documents`;
          return client.post(url, form, { headers: { "Content-Type": "multipart/form-data" } }).then(() => key);
        })
      );
      const succeededKeys = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      const failures = results.filter((r) => r.status === "rejected");
      if (succeededKeys.length) {
        setPendingFiles((current) => {
          const next = { ...current };
          succeededKeys.forEach((key) => delete next[key]);
          return next;
        });
      }
      // One refresh for the whole batch, once everything has settled --
      // covers both the succeeded uploads (their badges flip to Uploaded)
      // and gives failures a fresh case to retry against.
      await refreshCaseData(effectiveCaseId);
      if (failures.length) {
        setActionError(errorMessage(failures[0].reason, "Could not save one or more documents. Please try again."));
      }
    } finally {
      uploads.forEach(([key]) => inFlightKeysRef.current.delete(key));
    }
  }

  // Uploads a document's already-known bytes to S3 using the document id
  // create_case_full just created -- pure S3, zero Sheets calls per file
  // (see PUT /cases/{id}/documents/{id}/content), unlike uploadFiles above.
  // Same background/non-blocking/batched shape as uploadFiles, just against
  // documents that already exist instead of ones still needing to be
  // created.
  async function uploadDocumentContents(filesByDocumentId, caseId) {
    const uploads = Object.entries(filesByDocumentId).filter(([key]) => !inFlightKeysRef.current.has(key));
    if (!uploads.length) return;
    uploads.forEach(([key]) => inFlightKeysRef.current.add(key));
    setActionError("");
    try {
      const results = await Promise.allSettled(
        uploads.map(([documentId, file]) => {
          const form = new FormData();
          form.append("file", file);
          return client.put(`/cases/${caseId}/documents/${documentId}/content`, form, { headers: { "Content-Type": "multipart/form-data" } }).then(() => documentId);
        })
      );
      const succeededKeys = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      const failures = results.filter((r) => r.status === "rejected");
      if (succeededKeys.length) {
        setPendingFiles((current) => {
          const next = { ...current };
          succeededKeys.forEach((key) => delete next[key]);
          return next;
        });
      }
      await refreshCaseData(caseId);
      if (failures.length) {
        setActionError(errorMessage(failures[0].reason, "Could not save one or more documents. Please try again."));
      }
    } finally {
      uploads.forEach(([key]) => inFlightKeysRef.current.delete(key));
    }
  }

  // Creates the case itself in the background -- the slow part is the same
  // Sheets round-trip that used to block the qualifications screen, but now
  // it happens while the student is already looking at, and can act on, this
  // fully-rendered screen. A brand-new case (isFull) goes through
  // create-full -- one batched call creates the case, every course, and
  // every document's metadata together (see create_case_full in
  // cases_router.py); changing stream on an existing case still goes
  // through the older replace flow, unchanged.
  async function createCase() {
    setCreatingError("");
    const { payload, existingCaseId, isFull } = pendingCreate;
    try {
      if (isFull) {
        const res = await client.post("/cases/create-full", payload);
        adoptFullyCreatedCase(res.data, payload);
        return;
      }
      const res = existingCaseId
        ? await client.put(`/cases/${existingCaseId}/replace`, payload)
        : await client.post("/cases", payload);
      adoptCreatedCase(res.data);
    } catch (err) {
      if (err?.response?.status === 409) {
        // We've already created this exact case -- most likely this is a
        // second attempt (e.g. the student reloaded the page) landing after
        // the first one already succeeded in the background. Recover by
        // adopting whatever case now exists instead of leaving the student
        // stuck on an error that retrying can never get past. For the
        // isFull path there's no reliable way to re-match this attempt's
        // pending files against the earlier attempt's already-created
        // document ids, so this just shows the case as it already is --
        // the earlier attempt's documents are already there.
        try {
          const existing = await client.get("/cases");
          const ownCase = existing.data[0];
          if (ownCase) {
            const full = await client.get(`/cases/${ownCase.id}`);
            if (isFull) {
              setCaseData(full.data);
              setPendingFiles({});
              setCreatingCase(false);
            } else {
              adoptCreatedCase(full.data);
            }
            return;
          }
        } catch {
          // fall through to the generic error below
        }
      }
      setCreatingError(errorMessage(err, "Could not create your case — please try again."));
    }
  }

  // Shared by both the normal create/replace success path and the
  // DUPLICATE_CASE recovery path above: re-keys any pending files from
  // their placeholder (position-based) course id to the real one now that
  // the case (and its real course ids) exist, then kicks off their upload.
  function adoptCreatedCase(created) {
    const indexToRealId = {};
    created.courses.forEach((course, index) => {
      indexToRealId[String(index)] = String(course.id);
    });
    const rekeyed = {};
    Object.entries(pendingFilesRef.current).forEach(([key, file]) => {
      const [scope, docType] = key.split(":");
      const newScope = scope === "case" ? "case" : indexToRealId[scope] ?? scope;
      rekeyed[`${newScope}:${docType}`] = file;
    });

    setCaseData(created);
    setPendingFiles(rekeyed);
    setCreatingCase(false);
    if (Object.keys(rekeyed).length) {
      uploadFiles(rekeyed, { caseId: created.id });
    }
  }

  // create-full already created every document's metadata (see
  // create_case_full in cases_router.py) -- this just needs to match each
  // pending file to the document id it was created as, then upload its
  // actual bytes. The match is positional: `sentPayload` and `created` both
  // list courses/documents in the exact same order (neither side reorders
  // or filters differently), so zipping sentPayload's manifest against
  // created's real ids is exact, not a guess.
  function adoptFullyCreatedCase(created, sentPayload) {
    const documentIdByPendingKey = {};
    sentPayload.courses.forEach((course, i) => {
      const createdCourse = created.courses[i];
      course.documents.forEach((doc, j) => {
        const createdDoc = createdCourse?.documents?.[j];
        if (createdDoc) documentIdByPendingKey[`${i}:${doc.doc_type}`] = createdDoc.id;
      });
    });
    (sentPayload.case_documents || []).forEach((doc, j) => {
      const createdDoc = created.documents?.[j];
      if (createdDoc) documentIdByPendingKey[`case:${doc.doc_type}`] = createdDoc.id;
    });

    const rekeyed = {};
    Object.entries(pendingFilesRef.current).forEach(([key, file]) => {
      const documentId = documentIdByPendingKey[key];
      if (documentId != null) rekeyed[documentId] = file;
    });

    setCaseData(created);
    setPendingFiles(rekeyed);
    setCreatingCase(false);
    if (Object.keys(rekeyed).length) {
      uploadDocumentContents(rekeyed, created.id);
    }
  }

  useEffect(() => {
    if (!pendingCreate || caseCreationStarted.current) return;
    caseCreationStarted.current = true;
    createCase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCreate]);

  // Triggers all three cascading checks (qualification/CRICOS duration,
  // document validity, lodgement date) in one backend call -- the backend
  // runs them in order and short-circuits exactly as before (document
  // validity only computed once qualification is eligible, lodgement date
  // only once both are), it just no longer costs three separate round trips
  // to do it: see run_checks in cases_router.py. Whoever triggers this
  // first is the one whose call actually runs it; anyone viewing the case
  // afterward just reads the stored result.
  async function runChecks() {
    // The case itself may still be getting created in the background (see
    // createCase above) -- caseData.id stays null (a placeholder) until that
    // finishes. A student who moves through the screens quickly can reach
    // this before it resolves; without this guard the request goes to the
    // literal URL "/cases/null/run-checks", which the backend rejects with a
    // confusing raw validation error instead of a real answer.
    if (!caseData?.id) {
      setActionError("Your case is still being created — please wait a moment and try again.");
      return null;
    }
    setCheckingEligibility(true);
    setCheckingDocumentValidity(true);
    setCheckingLodgementDate(true);
    setActionError("");
    try {
      const res = await client.post(`/cases/${caseData.id}/run-checks`);
      // All three breakdowns are persisted server-side and always come back
      // together in every response (see detail_response in cases_router.py),
      // so there's nothing to merge in from the prior state here.
      setCaseData(res.data);
      return res.data;
    } catch (requestError) {
      setActionError(errorMessage(requestError, "Could not check your results. Please try again."));
      return null;
    } finally {
      setCheckingEligibility(false);
      setCheckingDocumentValidity(false);
      setCheckingLodgementDate(false);
    }
  }

  async function markReviewed() {
    setMarkingReviewed(true);
    setActionError("");
    try {
      await client.post(`/cases/${caseData.id}/review`);
      navigate("/cases");
    } catch (requestError) {
      setActionError(errorMessage(requestError, "Could not mark this case as reviewed. Please try again."));
      setMarkingReviewed(false);
    }
  }

  // Runs the checks automatically the moment any of their calculation-
  // details breakdowns isn't there yet to show -- no need to click "Check
  // Eligibility" etc. manually. A breakdown is persisted (see
  // duration_breakdown_json etc. in cases_router.py) the moment its check
  // actually runs, so once it exists, a later page load just displays it
  // without recomputing anything. This also self-heals a case that was
  // checked before this persistence existed (status/reason stored, but no
  // breakdown yet) -- its first load under this code backfills the missing
  // breakdown instead of leaving it permanently blank. Fires exactly once
  // per mount (autoCheckStarted); the sequential gate itself (document
  // validity only once qualification is eligible, lodgement date only once
  // both are) now lives entirely in the single runChecks call/endpoint.
  useEffect(() => {
    if (isAdmin || !caseData?.id || !reviewConfirmed || autoCheckStarted.current) return;
    // "pending" keeps retrying on every visit (a genuine, possibly-fixable
    // data gap -- e.g. a document the student hasn't added yet); "eligible"
    // and "not_eligible" are final verdicts that only need a run once, to
    // produce the breakdown that then just gets displayed from then on.
    const needsEligibility = !caseData.duration_breakdown || caseData.eligibility_status === "pending";
    const needsDocumentValidity = !caseData.document_validity_breakdown || caseData.document_validity_status === "pending";
    const needsLodgement = !caseData.lodgement_breakdown || caseData.lodgement_date_status === "pending";
    if (!needsEligibility && !needsDocumentValidity && !needsLodgement) return;
    autoCheckStarted.current = true;
    runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, caseData?.id, reviewConfirmed]);

  const load = useCallback(() => {
    setLoading(true);
    client
      .get(`/cases/${caseId}`)
      .then((res) => setCaseData(res.data))
      .catch(() => setLoadError("Could not load case"))
      .finally(() => setLoading(false));
  }, [caseId]);

  useEffect(() => {
    if (pendingCreate) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  if (loading) {
    return (
      <AppShell>
        <PageLoader label="Loading case…" />
      </AppShell>
    );
  }

  if (loadError || !caseData) {
    return (
      <AppShell>
        <p className="rounded-lg bg-[#fde8e8] px-4 py-3 text-sm font-medium text-[#b42318]">
          {loadError || "Case not found"}
        </p>
      </AppShell>
    );
  }

  const showQualifications = isAdmin || step === "qualifications";
  const showAdditional = isAdmin || step === "additional";
  const showReview = !isAdmin && step === "submitted" && !reviewConfirmed;
  const showSubmitted = !isAdmin && step === "submitted" && reviewConfirmed;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-headline text-4xl font-bold tracking-tight text-[#002d48]">
              {caseData.student_name}
            </h1>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full bg-[#eaf1fb] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#004384]">
                {STREAM_LABEL[caseData.stream]}
              </span>
              {isAdmin && caseData.owner_email && (
                <span className="text-xs text-[#72777e]">{caseData.owner_email}</span>
              )}
              {isAdmin && caseData.status === "reviewed" && (
                <span className="rounded-full bg-[#dff3e3] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#126b2f]">
                  Reviewed
                </span>
              )}
            </div>
          </div>
          {!isAdmin && (
            <button
              type="button"
              onClick={() => navigate("/case?changeStream=true")}
              className="rounded-lg border border-[#c2c7ce] bg-white px-4 py-2 text-xs font-bold text-[#002d48] shadow-sm hover:bg-[#f4f3f1]"
            >
              Change stream / start again
            </button>
          )}
          {isAdmin && caseData.status !== "reviewed" && (
            <button
              type="button"
              disabled={markingReviewed}
              onClick={markReviewed}
              className="flex items-center gap-2 rounded-lg bg-[#002d48] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#004384] disabled:opacity-50"
            >
              {markingReviewed && <Spinner className="border-white/30 border-t-white" />}
              {markingReviewed ? "Saving…" : "Done — mark as reviewed"}
            </button>
          )}
          {isAdmin && caseData.status === "reviewed" && (
            <button
              type="button"
              onClick={() => navigate("/cases")}
              className="rounded-lg border border-[#c2c7ce] bg-white px-4 py-2 text-xs font-bold text-[#002d48] shadow-sm hover:bg-[#f4f3f1]"
            >
              Back to All Cases
            </button>
          )}
        </div>

        {creatingError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#fde8e8] px-4 py-3 text-sm font-medium text-[#b42318]">
            <span>{creatingError}</span>
            <button
              type="button"
              onClick={createCase}
              className="shrink-0 rounded-lg border border-[#b42318]/40 bg-white px-3 py-1.5 text-xs font-bold text-[#b42318] shadow-sm hover:bg-[#fde8e8]"
            >
              Retry
            </button>
          </div>
        )}
        {actionError && <p className="rounded-lg bg-[#fde8e8] px-4 py-3 text-sm font-medium text-[#b42318]">{actionError}</p>}

        {showQualifications && (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {caseData.courses.map((course) => (
                <div key={course.id} className="rounded-xl bg-white p-6 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-bold font-headline text-[#002d48]">{course.name}</p>
                    <span className="rounded-full bg-[#f4f3f1] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5f6670]">
                      {course.course_type}
                    </span>
                  </div>
                  {(course.start_date || course.end_date || course.cricos_weeks != null) && (
                    <p className="mt-1 text-xs text-[#72777e]">
                      {course.start_date || "—"} to {course.end_date || "—"}
                      {course.cricos_weeks != null && ` · CRICOS ${course.cricos_weeks} weeks`}
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {DOC_SLOTS.map((slot) => (
                      <DocUploadSlot
                        key={slot.doc_type}
                        label={slot.label}
                        required={slot.required}
                        document={course.documents.find((d) => d.doc_type === slot.doc_type)}
                        pendingFile={pendingFiles[fileKey(course.id, slot.doc_type)]}
                        onSelectFile={(event) => selectPendingFile(course.id, slot.doc_type, event)}
                        onRemovePendingFile={() => removePendingFile(course.id, slot.doc_type)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {showAdditional && (
          <div className="rounded-xl bg-white p-6 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
            <p className="text-lg font-bold font-headline text-[#002d48]">Additional Documents</p>
            <p className="mt-1 text-xs text-[#72777e]">
              A current AFP Certificate or AFP Receipt is fine — you don't need both.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CASE_DOC_SLOTS.map((slot) => (
                <DocUploadSlot
                  key={slot.doc_type}
                  label={slot.label}
                  required={slot.required}
                  document={caseData.documents.find((d) => d.doc_type === slot.doc_type)}
                  pendingFile={pendingFiles[`case:${slot.doc_type}`]}
                  onSelectFile={(event) => selectCaseDocument(slot.doc_type, event)}
                  onRemovePendingFile={() => removeCaseDocument(slot.doc_type)}
                />
              ))}
            </div>
          </div>
        )}

        {showReview && (
          <ExtractedDetailsReview payload={pendingCreate.payload} onNext={() => setReviewConfirmed(true)} />
        )}

        {showSubmitted && (
          <div>
            <p className="font-headline text-2xl font-bold text-[#002d48]">You're all set</p>
            <p className="mt-2 text-sm font-medium text-[#42474d]">
              Your documents have been submitted, and every check below runs automatically.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Column 1: Qualification check -- only rendered once it has
                  resolved; while loading, the shared panel below takes its
                  place instead of a per-column loader. */}
              {!eligibilityLoading && (
                <div className="flex flex-col rounded-xl bg-white p-6 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#72777e]">Qualification Check</p>
                  <>
                    <div
                      className={`mt-3 rounded-lg border-l-4 p-4 text-sm ${
                        caseData.eligibility_status === "eligible"
                          ? "border-[#2d5fa1] bg-[#eaf1fb] font-bold text-[#2d5fa1]"
                          : caseData.eligibility_status === "not_eligible"
                          ? "border-[#b42318] bg-[#fde8e8] font-bold text-[#b42318]"
                          : "border-[#ff8f37] bg-[#e9e8e5] font-medium text-[#42474d]"
                      }`}
                    >
                      {caseData.eligibility_status === "eligible" && (
                        <p>
                          Meets the required study duration.
                          {isAdmin && caseData.total_duration_weeks != null && ` (${caseData.total_duration_weeks} credited weeks)`}
                        </p>
                      )}
                      {caseData.eligibility_status === "not_eligible" && (
                        <p>Not eligible.{caseData.eligibility_reason && ` ${caseData.eligibility_reason}`}</p>
                      )}
                      {caseData.eligibility_status === "pending" && (
                        <p>
                          {caseData.eligibility_reason
                            ? `Couldn't fully check eligibility yet: ${caseData.eligibility_reason}`
                            : "Eligibility hasn't been checked yet."}
                        </p>
                      )}
                    </div>

                    {caseData.duration_breakdown && (
                      <div className="mt-4 space-y-4">
                        <p className="text-xs font-bold text-[#002d48]">Calculation Details</p>

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#72777e]">
                            Dates extracted from documents
                          </p>
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full min-w-[420px] text-left text-xs">
                              <thead>
                                <tr className="text-[#72777e]">
                                  <th className="pb-1 pr-2 font-semibold">Course</th>
                                  <th className="pb-1 pr-2 font-semibold">Start</th>
                                  <th className="pb-1 pr-2 font-semibold">End</th>
                                  <th className="pb-1 pr-2 font-semibold">Actual wks</th>
                                  <th className="pb-1 font-semibold">CRICOS wks</th>
                                </tr>
                              </thead>
                              <tbody className="text-[#1a1c1a]">
                                {caseData.courses.map((course) => (
                                  <tr key={course.id} className="border-t border-[#c2c7ce]/40">
                                    <td className="py-1.5 pr-2">{course.name}</td>
                                    <td className="py-1.5 pr-2">{course.start_date || "—"}</td>
                                    <td className="py-1.5 pr-2">{course.end_date || "—"}</td>
                                    <td className="py-1.5 pr-2">{weeksBetween(course.start_date, course.end_date) ?? "—"}</td>
                                    <td className="py-1.5">{course.cricos_weeks ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#72777e]">Credited weeks</p>
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full min-w-[420px] text-left text-xs">
                              <thead>
                                <tr className="text-[#72777e]">
                                  <th className="pb-1 pr-2 font-semibold">Group</th>
                                  <th className="pb-1 pr-2 font-semibold">Actual</th>
                                  <th className="pb-1 pr-2 font-semibold">CRICOS</th>
                                  <th className="pb-1 font-semibold">Credited</th>
                                </tr>
                              </thead>
                              <tbody className="text-[#1a1c1a]">
                                {caseData.duration_breakdown.groups.map((group) => (
                                  <tr key={group.label} className="border-t border-[#c2c7ce]/40">
                                    <td className="py-1.5 pr-2">{group.label}</td>
                                    <td className="py-1.5 pr-2">{group.actual_weeks}</td>
                                    <td className="py-1.5 pr-2">{group.required_weeks ?? "—"}</td>
                                    <td className="py-1.5">{group.credited_weeks}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="rounded-lg bg-[#f4f3f1] px-3 py-2 text-xs font-medium text-[#42474d]">
                          Total: <span className="font-bold text-[#1a1c1a]">{caseData.duration_breakdown.total_weeks}</span> wks
                          {" "}/ Min required:{" "}
                          <span className="font-bold text-[#1a1c1a]">{caseData.duration_breakdown.min_required_weeks}</span> wks
                        </div>
                      </div>
                    )}
                  </>
                </div>
              )}

              {/* Column 2: Document validity check -- only meaningful once
                  the qualification check is eligible (see the disabled
                  button below and the backend's own gate); only rendered
                  once resolved, same reasoning as Column 1. */}
              {!documentValidityLoading && (
                <div className="flex flex-col rounded-xl bg-white p-6 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#72777e]">Document Validity Check</p>
                  <>
                    <div
                      className={`mt-3 rounded-lg border-l-4 p-4 text-sm ${
                        caseData.document_validity_status === "eligible"
                          ? "border-[#2d5fa1] bg-[#eaf1fb] font-bold text-[#2d5fa1]"
                          : caseData.document_validity_status === "not_eligible"
                          ? "border-[#b42318] bg-[#fde8e8] font-bold text-[#b42318]"
                          : "border-[#ff8f37] bg-[#e9e8e5] font-medium text-[#42474d]"
                      }`}
                    >
                      {caseData.document_validity_status === "eligible" && <p>Current Visa, PTE, OVHC, and AFP are all valid.</p>}
                      {caseData.document_validity_status === "not_eligible" && (
                        <p>Not valid.{caseData.document_validity_reason && ` ${caseData.document_validity_reason}`}</p>
                      )}
                      {caseData.document_validity_status === "pending" && (
                        <p>
                          {caseData.document_validity_reason
                            ? `Couldn't fully check document validity yet: ${caseData.document_validity_reason}`
                            : "Document validity hasn't been checked yet."}
                        </p>
                      )}
                    </div>

                    {caseData.document_validity_breakdown && (
                      <div className="mt-4">
                        <p className="text-xs font-bold text-[#002d48]">Calculation Details</p>
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[420px] text-left text-xs">
                            <thead>
                              <tr className="text-[#72777e]">
                                <th className="pb-1 pr-2 font-semibold">Document</th>
                                <th className="pb-1 font-semibold">Extracted</th>
                              </tr>
                            </thead>
                            <tbody className="text-[#1a1c1a]">
                              {caseData.document_validity_breakdown.checks.map((check) => (
                                <tr key={check.label} className="border-t border-[#c2c7ce]/40">
                                  <td className="py-1.5 pr-2">{check.label}</td>
                                  <td className="py-1.5">
                                    {Object.keys(check.extracted).length
                                      ? Object.entries(check.extracted)
                                          .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
                                          .join(", ")
                                      : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                </div>
              )}

              {/* Column 3: Lodgement date calculation -- meaningless unless
                  BOTH the other two checks are eligible (a lodgement date
                  for someone who doesn't qualify, or whose documents aren't
                  currently valid, means nothing); only rendered once
                  resolved, same reasoning as the other two columns. */}
              {!lodgementLoading && (
                <div className="flex flex-col rounded-xl bg-white p-6 shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#72777e]">Lodgement Date Calculation</p>

                  <div className="mt-3">
                  <DocUploadSlot
                    label="New CoE"
                    required={false}
                    document={caseData.documents.find((d) => d.doc_type === "new_coe")}
                    pendingFile={pendingFiles["case:new_coe"]}
                    onSelectFile={selectNewCoeDocument}
                    onRemovePendingFile={() => removeCaseDocument("new_coe")}
                  />
                </div>

                <>
                    <div
                      className={`mt-3 rounded-lg border-l-4 p-4 text-sm ${
                        caseData.lodgement_date_status === "eligible"
                          ? "border-[#2d5fa1] bg-[#eaf1fb] font-bold text-[#2d5fa1]"
                          : caseData.lodgement_date_status === "not_eligible"
                          ? "border-[#b42318] bg-[#fde8e8] font-bold text-[#b42318]"
                          : "border-[#ff8f37] bg-[#e9e8e5] font-medium text-[#42474d]"
                      }`}
                    >
                      {caseData.lodgement_date_status === "eligible" && (
                        <p>
                          Lodgement date: {caseData.lodgement_date}.
                          {caseData.lodgement_basis && ` ${caseData.lodgement_basis}.`}
                        </p>
                      )}
                      {caseData.lodgement_date_status === "not_eligible" && (
                        <p>Not eligible to lodge.{caseData.lodgement_date_reason && ` ${caseData.lodgement_date_reason}`}</p>
                      )}
                      {caseData.lodgement_date_status === "pending" && (
                        <p>
                          {caseData.lodgement_date_reason
                            ? `Couldn't calculate the lodgement date yet: ${caseData.lodgement_date_reason}`
                            : "Lodgement date hasn't been calculated yet."}
                        </p>
                      )}
                    </div>

                    {caseData.lodgement_breakdown && (
                      <div className="mt-4 space-y-3">
                        <p className="text-xs font-bold text-[#002d48]">Calculation Details</p>
                        <p className="text-xs text-[#42474d]">
                          Latest completion date:{" "}
                          <span className="font-bold text-[#1a1c1a]">{caseData.lodgement_breakdown.latest_completion_date || "—"}</span>.
                          {" "}Window ends:{" "}
                          <span className="font-bold text-[#1a1c1a]">{caseData.lodgement_breakdown.window_end || "—"}</span>.
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[420px] text-left text-xs">
                            <thead>
                              <tr className="text-[#72777e]">
                                <th className="pb-1 pr-2 font-semibold">Factor</th>
                                <th className="pb-1 pr-2 font-semibold">Date</th>
                                <th className="pb-1 font-semibold">Considered?</th>
                              </tr>
                            </thead>
                            <tbody className="text-[#1a1c1a]">
                              {caseData.lodgement_breakdown.factors.map((factor) => (
                                <tr key={factor.label} className="border-t border-[#c2c7ce]/40">
                                  <td className="py-1.5 pr-2">{factor.label}</td>
                                  <td className="py-1.5 pr-2">{factor.date || "—"}</td>
                                  <td className="py-1.5">{factor.included ? "Yes" : "Excluded"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
              </div>
              )}
              {anyColumnLoading && <SharedLoadingPanel span={loadingSpan} messageIndex={loadingMessageIndex} />}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
