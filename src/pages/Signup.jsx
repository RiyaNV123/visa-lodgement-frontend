import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client.js";
import Spinner from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Signup() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={user.role === "admin" ? "/cases" : "/case"} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signup(email, password, fullName);
      navigate("/case", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Signup failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#002d48] p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#1b4361] p-2 shadow-[0px_20px_40px_rgba(27,67,97,0.3)]">
        <div className="rounded-xl bg-white p-8">
          <h1 className="font-headline text-2xl font-bold text-[#002d48]">Create your account</h1>
          <p className="mt-1 text-sm text-[#72777e]">
            For students applying for a 485 visa. Admin accounts are provisioned separately.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#72777e]">
                Full name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#c2c7ce] px-3 py-2 text-sm text-[#1a1c1a] focus:border-[#004384] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#72777e]">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#c2c7ce] px-3 py-2 text-sm text-[#1a1c1a] focus:border-[#004384] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#72777e]">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#c2c7ce] px-3 py-2 text-sm text-[#1a1c1a] focus:border-[#004384] focus:outline-none"
              />
              <p className="mt-1 text-xs text-[#72777e]">Minimum 8 characters.</p>
            </div>

            {error && (
              <p className="rounded-lg bg-[#fde8e8] px-3 py-2 text-xs font-medium text-[#b42318]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#002d48] py-2.5 text-sm font-bold font-headline text-white shadow-sm hover:bg-[#004384] disabled:opacity-50"
            >
              {submitting && <Spinner className="border-white/30 border-t-white" />}
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-[#72777e]">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-[#2d5fa1] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
