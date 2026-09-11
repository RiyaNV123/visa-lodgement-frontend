import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client.js";
import AppShell from "../components/AppShell.jsx";
import { PageLoader } from "../components/Spinner.jsx";

const STREAM_LABEL = { vocational: "Post Vocational 485", higher: "Post Higher 485" };

export default function Dashboard() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    client
      .get("/admin/students")
      .then((res) => setStudents(res.data))
      .catch(() => setError("Could not load students"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="font-headline text-4xl font-bold tracking-tight text-[#002d48]">
            All Cases
          </h1>
          <p className="mt-1 text-sm font-medium text-[#42474d]">
            Every student who has signed up through the portal, with their case if they've started one.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-[#fde8e8] px-4 py-3 text-sm font-medium text-[#b42318]">
            {error}
          </p>
        )}

        <div className="overflow-hidden rounded-xl bg-white shadow-[0px_20px_40px_rgba(27,67,97,0.06)]">
          {loading ? (
            <PageLoader label="Loading students…" />
          ) : (
            <div className="max-h-[70vh] overflow-auto scrollbar-minimal">
              <table className="min-w-max w-full">
                <thead className="sticky top-0 bg-[#f4f3f1]">
                  <tr>
                    {["Student", "Email", "Case", "Review status", "Courses", "Signed up", ""].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#72777e]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-sm text-[#72777e]">
                        No students have signed up yet.
                      </td>
                    </tr>
                  )}
                  {students.map((s) => (
                    <tr key={s.id} className="border-t border-[#9aa3af]/20">
                      <td className="max-w-[280px] break-words px-6 py-4 text-sm font-semibold text-[#1a1c1a]">
                        {s.full_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-[#42474d]">{s.email}</td>
                      <td className="px-6 py-4">
                        {s.case ? (
                          <span className="rounded-full bg-[#eaf1fb] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#004384]">
                            {STREAM_LABEL[s.case.stream]}
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#e9e8e5] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5f6670]">
                            No case yet
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {!s.case ? (
                          <span className="text-sm text-[#72777e]">—</span>
                        ) : s.case.status === "reviewed" ? (
                          <span className="rounded-full bg-[#dff3e3] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#126b2f]">
                            Reviewed
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#fff3d6] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8a5b00]">
                            Needs review
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-[#42474d]">{s.case?.course_count ?? "—"}</td>
                      <td className="px-6 py-4 text-sm text-[#42474d]">
                        {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="min-w-[140px] px-6 py-4">
                        {s.case ? (
                          <button
                            onClick={() => navigate(`/cases/${s.case.id}`)}
                            className="rounded-lg border border-[#c2c7ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#002d48] shadow-sm hover:bg-[#f4f3f1]"
                          >
                            View
                          </button>
                        ) : (
                          <span className="text-xs text-[#72777e]">Nothing to view</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
