import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium font-label transition-colors ${
          isActive
            ? "bg-white text-[#002d48] shadow-sm"
            : "text-[#eaf1fb]/80 hover:bg-white/10 hover:text-white"
        }`
      }
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      {label}
    </NavLink>
  );
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 flex-col self-start bg-[#002d48] p-4 md:flex">
          <div className="mb-8 px-2 pt-2">
            <p className="font-headline text-lg font-bold text-white">ACME Migration</p>
            <p className="text-xs text-[#c9dcff]">485 Lodgement Calculator</p>
          </div>
          <nav className="flex flex-col gap-1">
            {isAdmin ? (
              <NavItem to="/cases" icon="folder_open" label="All Cases" />
            ) : (
              <NavItem to="/case" icon="assignment" label="My Case" />
            )}
          </nav>
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#c2c7ce]/20 bg-white/90 px-6 py-4 backdrop-blur md:px-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#72777e]">
                {isAdmin ? "Admin" : "Student"}
              </p>
              <p className="text-sm font-semibold text-[#002d48]">{user?.full_name}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-[#c2c7ce] px-3 py-2 text-sm font-semibold text-[#002d48] shadow-sm hover:bg-[#f4f3f1]"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </header>
          <main className="flex-1 px-6 py-8 md:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
