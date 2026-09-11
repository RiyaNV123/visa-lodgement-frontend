import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import client from "../api/client.js";
import AppShell from "../components/AppShell.jsx";
import { PageLoader } from "../components/Spinner.jsx";
import CaseNew from "./CaseNew.jsx";

export default function MyCase() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hasCase, setHasCase] = useState(undefined); // undefined = loading
  const [existingCaseId, setExistingCaseId] = useState(null);

  useEffect(() => {
    client
      .get("/cases")
      .then((res) => {
        setExistingCaseId(res.data[0]?.id ?? null);
        setHasCase(Boolean(res.data[0]));
      })
      .catch(() => setHasCase(false));
  }, []);

  if (hasCase === undefined) {
    return (
      <AppShell>
        <PageLoader label="Loading your case…" />
      </AppShell>
    );
  }

  // A case already exists -- there's no editing flow yet, so send them straight to uploads.
  const changingStream = new URLSearchParams(location.search).get("changeStream") === "true";

  if (hasCase && !changingStream) {
    return <Navigate to="/case/uploads" replace />;
  }

  return (
    <CaseNew
      existingCaseId={changingStream ? existingCaseId : null}
      onCreated={(creatingCase, pendingFiles) =>
        navigate("/case/uploads", { replace: true, state: { creatingCase, pendingFiles } })
      }
    />
  );
}
