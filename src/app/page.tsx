import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black p-8">
      <div className="relative z-10 text-center space-y-8 max-w-2xl">
        {/* Logo */}
        <div className="mx-auto w-24 h-24 relative">
          {/* Main: Octocat */}
          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center">
            <svg
              viewBox="0 0 16 16"
              className="h-14 w-14 text-black"
              fill="currentColor"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </div>
          {/* Overlay: Map icon on bottom-right */}
          <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-black border-2 border-white rounded-xl flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight">
          HuntBase 🎯
        </h1>

        {/* Subtitle */}
        <p className="text-xl text-gray-400 max-w-md mx-auto leading-relaxed">
          The multi-tenant campus treasure hunt platform. Solve clues, scan QR codes, and race in real-time!
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Link href="/register">
            <button className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-gray-200 text-black font-semibold rounded-xl text-lg transition-colors">
              Register Team →
            </button>
          </Link>
          <Link href="/login">
            <button className="w-full sm:w-auto px-8 py-4 bg-transparent hover:bg-white/10 text-white font-semibold rounded-xl border border-white/30 text-lg transition-colors">
              Player Login
            </button>
          </Link>
        </div>

        {/* Admin Link */}
        <div className="pt-2">
          <Link href="/admin/events" className="text-sm text-gray-500 hover:text-white transition-colors">
            Admin Dashboard →
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 mt-16 text-center">
        <a
          href="https://github.com/Git-HubCommunityGitamHyd"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-5 w-5"
            fill="currentColor"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Made by GitHub Community GITAM Team
        </a>
      </footer>
    </div>
  );
}
