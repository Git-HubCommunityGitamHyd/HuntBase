"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface AdminSession {
    id: string;
    username: string;
    full_name?: string;
    role: "super_admin" | "club_admin";
    organization?: {
        id: string;
        name: string;
        slug: string;
        logo_url?: string | null;
    } | null;
}

const navItems = [
    { href: "/admin/events", label: "Events", icon: "📅" },
    { href: "/admin/clues", label: "Clues", icon: "🔍" },
    { href: "/admin/teams", label: "Teams", icon: "👥" },
    { href: "/admin/qr-codes", label: "QR Codes", icon: "📱" },
    { href: "/admin/monitor", label: "Live Monitor", icon: "📡" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [admin, setAdmin] = useState<AdminSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Sync admin auth directly from server session on mount
    useEffect(() => {
        let isMounted = true;

        async function verifyAdminAuth() {
            try {
                const res = await fetch("/api/auth/me");
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.admin) {
                        localStorage.setItem("admin", JSON.stringify(data.admin));
                        if (isMounted) {
                            setAdmin(data.admin);
                            setIsLoading(false);
                            return;
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to verify server session:", err);
            }

            // Fallback to localStorage if offline/delayed
            const storedAdmin = localStorage.getItem("admin");
            if (storedAdmin) {
                try {
                    const parsed = JSON.parse(storedAdmin);
                    if (isMounted) {
                        setAdmin(parsed);
                        setIsLoading(false);
                        return;
                    }
                } catch {
                    localStorage.removeItem("admin");
                }
            }

            // If no valid session, redirect to login
            if (isMounted) {
                setIsLoading(false);
                router.push("/admin-login");
            }
        }

        verifyAdminAuth();

        return () => {
            isMounted = false;
        };
    }, [router]);

    const handleLogout = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch (err) {
            console.error("Logout request failed:", err);
        } finally {
            localStorage.removeItem("admin");
            setAdmin(null);
            router.push("/admin-login");
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    if (!admin) return null;

    const clubName = admin.organization?.name || "HuntBase Host";
    const isSuperAdmin = admin.role === "super_admin";

    return (
        <div className="min-h-screen bg-black">
            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-black border-b border-white/10 z-50 flex items-center justify-between px-4">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="text-gray-400"
                >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </Button>
                <div className="text-center">
                    <h1 className="text-sm font-bold text-white truncate max-w-[180px]">{clubName}</h1>
                    <span className="text-[10px] text-zinc-400 font-mono">@{admin.username}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </Button>
            </div>

            {/* Sidebar */}
            <aside
                className={`fixed top-0 left-0 h-full w-64 bg-zinc-950 border-r border-white/10 z-40 transform lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                {/* Branded Club Header */}
                <div className="p-6 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg shrink-0">
                            🎯
                        </div>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-sm font-bold text-white truncate" title={clubName}>
                                {clubName}
                            </h1>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded border ${
                                    isSuperAdmin
                                        ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
                                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                }`}>
                                    {isSuperAdmin ? "Super Admin" : "Club Admin"}
                                </span>
                                <span className="text-[11px] text-zinc-400 font-mono truncate">
                                    @{admin.username}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Quick Link to Super Admin Console for Super Admins */}
                    {isSuperAdmin && (
                        <Link
                            href="/super-admin"
                            className="mt-3 flex items-center justify-between px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 text-xs font-medium transition-colors"
                        >
                            <span>👑 Super Admin Console</span>
                            <span>→</span>
                        </Link>
                    )}
                </div>

                <nav className="p-4 space-y-1">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsSidebarOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg ${pathname === item.href
                                ? "bg-white/10 text-white font-medium"
                                : "text-gray-400 hover:bg-white/5 hover:text-white"
                                }`}
                        >
                            <span>{item.icon}</span>
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 space-y-2">
                    <Link
                        href="/"
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white w-full text-xs"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        Back to Home
                    </Link>
                    <Button
                        variant="ghost"
                        onClick={handleLogout}
                        className="w-full justify-start text-gray-400 hover:text-red-400 hover:bg-red-500/10 text-xs h-9 px-4"
                    >
                        <svg className="h-4 w-4 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                    </Button>
                </div>
            </aside>

            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Main Content */}
            <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
                <div className="p-6">{children}</div>
            </main>
        </div>
    );
}
