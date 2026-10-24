"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Team, TeamMember } from "@/lib/types";

interface AuthContextType {
    player: TeamMember | null;
    team: Team | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (player: TeamMember, team: Team) => void;
    logout: () => void;
    refreshTeam: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Routes that don't require authentication
const publicRoutes = ["/", "/login", "/register", "/register-club", "/admin-login"];
// Routes that require admin authentication
const adminRoutes = ["/admin", "/super-admin"];

export function AuthProvider({ children }: { children: ReactNode }) {
    const [player, setPlayer] = useState<TeamMember | null>(null);
    const [team, setTeam] = useState<Team | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    // Load session from localStorage on mount
    useEffect(() => {
        const loadSession = () => {
            try {
                const storedPlayer = localStorage.getItem("player");
                const storedTeam = localStorage.getItem("team");

                if (storedPlayer && storedTeam) {
                    setPlayer(JSON.parse(storedPlayer));
                    setTeam(JSON.parse(storedTeam));
                }
            } catch (error) {
                console.error("Error loading session:", error);
                // Clear corrupted data
                localStorage.removeItem("player");
                localStorage.removeItem("team");
            } finally {
                setIsLoading(false);
            }
        };

        loadSession();
    }, []);

    // Handle route protection
    useEffect(() => {
        if (isLoading) return;

        const isPublicRoute = publicRoutes.some(route => pathname === route);
        const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route));

        if (!isPublicRoute && !isAdminRoute && !player) {
            // Not authenticated and trying to access protected route
            const search = typeof window !== "undefined" ? window.location.search : "";
            const currentUrl = `${pathname}${search}`;
            router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
        }
    }, [isLoading, player, pathname, router]);

    const login = (newPlayer: TeamMember, newTeam: Team) => {
        setPlayer(newPlayer);
        setTeam(newTeam);
        localStorage.setItem("player", JSON.stringify(newPlayer));
        localStorage.setItem("team", JSON.stringify(newTeam));
    };

    const logout = () => {
        setPlayer(null);
        setTeam(null);
        localStorage.removeItem("player");
        localStorage.removeItem("team");
        fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        router.push("/login");
    };

    const refreshTeam = async () => {
        if (!team?.id) return;

        try {
            const response = await fetch(`/api/teams/${team.id}`);
            const data = await response.json();
            if (data.success && data.team) {
                setTeam(data.team);
                localStorage.setItem("team", JSON.stringify(data.team));
            }
        } catch (error) {
            console.error("Error refreshing team:", error);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                player,
                team,
                isLoading,
                isAuthenticated: !!player,
                login,
                logout,
                refreshTeam,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
