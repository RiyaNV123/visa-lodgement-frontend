import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import client from "../api/client.js";
import AppShell from "../components/AppShell.jsx";
import { PageLoader } from "../components/Spinner.jsx";
import CaseDetail from "./CaseDetail.jsx";

export default function MyCaseUploads() {
  const location = useLocation();
  const navigate = useNavigate();
  // Captured once, at mount -- immune to the history-state scrub below, so
  // CaseDetail still gets what it needs for this render even after that
  // state is cleared out from under it.
  const [handoff] = useState(() => location.state);
  const creatingCase = handoff?.creatingCase;
  const [caseId, setCaseId] = useState(undefined); // undefined = loading, null = none yet

  useEffect(() => {
    if (!creatingCase) return;
    // The case-creation handoff is meant to fire exactly once. If it stays
    // in history state and the student reloads this page (or comes back to
    // it via browser back/forward), CaseDetail would see it again and try
    // to create the very case it already created -- which fails with
    // DUPLICATE_CASE since it's already there. Scrubbing it right away
    // means a reload instead falls through to the normal "look up my
    // existing case" path below.
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // A case just handed off from the qualifications screen doesn't exist
    // yet -- CaseDetail creates it itself, in the background. Skip the
    // lookup entirely so the next screen renders immediately instead of
    // waiting on a GET for a case that isn't there.
    if (creatingCase) return;
    client
      .get("/cases")
      .then((res) => setCaseId(res.data[0]?.id ?? null))
      .catch(() => setCaseId(null));
  }, [creatingCase]);

  if (creatingCase) {
    return <CaseDetail pendingCreate={creatingCase} initialPendingFiles={handoff?.pendingFiles} />;
  }

  if (caseId === undefined) {
    return (
      <AppShell>
        <PageLoader label="Loading your case…" />
      </AppShell>
    );
  }

  if (!caseId) {
    return <Navigate to="/case" replace />;
  }

  return <CaseDetail caseId={caseId} />;
}
