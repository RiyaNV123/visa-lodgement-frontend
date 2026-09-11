export default function Spinner({ className = "" }) {
  return (
    <div
      className={`h-4 w-4 animate-spin rounded-full border-2 border-[#c2c7ce] border-t-[#002d48] ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageLoader({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16">
      <Spinner className="h-5 w-5" />
      <p className="text-sm text-[#72777e]">{label}</p>
    </div>
  );
}
