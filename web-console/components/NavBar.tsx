import Link from "next/link";

export default function NavBar() {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-white font-bold text-lg tracking-tight">
          BimaRide AI <span className="text-slate-500 font-normal text-sm">/ Insurer Console</span>
        </Link>
        <nav className="flex gap-6 text-sm">
          <Link href="/" className="text-slate-300 hover:text-white">
            Portfolio
          </Link>
          <Link href="/riders" className="text-slate-300 hover:text-white">
            Riders
          </Link>
        </nav>
      </div>
    </header>
  );
}
