"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface HostUserSummary {
    id: string;
    username: string;
    full_name: string;
    email: string;
    role: string;
    is_active: boolean;
}

interface EventSummary {
    id: string;
    name: string;
    is_active: boolean;
}

interface ClubOrganization {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    contact_email: string | null;
    is_verified: boolean;
    created_at: string;
    host_users: HostUserSummary[];
    events: EventSummary[];
}

export default function SuperAdminPage() {
    const router = useRouter();
    const [clubs, setClubs] = useState<ClubOrganization[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ text: string; type: "success" | "error" } | null>(null);

    const fetchClubs = async () => {
        try {
            const res = await fetch("/api/super-admin/clubs");
            const data = await res.json();
            if (data.success) {
                setClubs(data.clubs || []);
            } else if (res.status === 403 || res.status === 401) {
                router.push("/admin-login");
            }
        } catch (err) {
            console.error("Failed to load clubs:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchClubs();
    }, []);

    // Toggle Verification (Approve / Revoke)
    const handleToggleVerification = async (orgId: string, currentStatus: boolean) => {
        setProcessingId(orgId);
        setNotification(null);

        try {
            const res = await fetch("/api/super-admin/clubs/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    organization_id: orgId,
                    is_verified: !currentStatus,
                }),
            });

            const data = await res.json();
            if (data.success) {
                setNotification({
                    text: !currentStatus ? "Club approved successfully!" : "Club access revoked.",
                    type: "success",
                });
                await fetchClubs();
            } else {
                setNotification({ text: data.message || "Failed to update club status", type: "error" });
            }
        } catch (err) {
            console.error("Action error:", err);
            setNotification({ text: "Network error", type: "error" });
        } finally {
            setProcessingId(null);
        }
    };

    // Delete Club
    const handleDeleteClub = async (orgId: string, clubName: string) => {
        if (!confirm(`Are you sure you want to permanently delete "${clubName}"? This will delete all its events, teams, and clues.`)) {
            return;
        }

        setProcessingId(orgId);
        setNotification(null);

        try {
            const res = await fetch(`/api/super-admin/clubs?organization_id=${encodeURIComponent(orgId)}`, {
                method: "DELETE",
            });

            const data = await res.json();
            if (data.success) {
                setNotification({ text: `"${clubName}" has been deleted.`, type: "success" });
                await fetchClubs();
            } else {
                setNotification({ text: data.message || "Failed to delete club", type: "error" });
            }
        } catch (err) {
            console.error("Delete error:", err);
            setNotification({ text: "Failed to connect to server", type: "error" });
        } finally {
            setProcessingId(null);
        }
    };

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        localStorage.removeItem("admin");
        router.push("/admin-login");
    };

    const pendingClubs = clubs.filter((c) => !c.is_verified);
    const verifiedClubs = clubs.filter((c) => c.is_verified);
    const totalEvents = clubs.reduce((acc, c) => acc + (c.events?.length || 0), 0);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white p-6 sm:p-10 max-w-7xl mx-auto space-y-8">
            {/* Top Navigation Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-zinc-800">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                            Super Admin Console
                        </h1>
                        <span className="rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-400 border border-purple-500/20">
                            Platform Owner
                        </span>
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                        Oversee all campus clubs, approve new tenant requests, and monitor overall platform metrics.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Link href="/admin/events">
                        <Button variant="outline" size="sm" className="border-zinc-700 bg-zinc-900 text-zinc-200 text-xs">
                            Switch to Club Dashboard →
                        </Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={handleLogout} className="text-zinc-400 hover:text-red-400 text-xs">
                        Logout
                    </Button>
                </div>
            </div>

            {/* Notification alert */}
            {notification && (
                <Alert className={notification.type === "success" ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300" : "bg-red-950/40 border-red-500/30 text-red-300"}>
                    <AlertDescription className="flex justify-between items-center text-xs">
                        <span>{notification.text}</span>
                        <button onClick={() => setNotification(null)} className="text-zinc-400 hover:text-white">✕</button>
                    </AlertDescription>
                </Alert>
            )}

            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-zinc-950 border-zinc-800">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-xs text-zinc-400">Total Registered Clubs</CardDescription>
                        <CardTitle className="text-3xl font-bold text-white">{clubs.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-[11px] text-zinc-500">
                        {verifiedClubs.length} verified active on campus
                    </CardContent>
                </Card>

                <Card className="bg-zinc-950 border-amber-500/30">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-xs text-amber-400 font-medium">Pending Review</CardDescription>
                        <CardTitle className="text-3xl font-bold text-amber-300">{pendingClubs.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-[11px] text-amber-500/80">
                        {pendingClubs.length > 0 ? "Awaiting your approval" : "All club requests reviewed"}
                    </CardContent>
                </Card>

                <Card className="bg-zinc-950 border-zinc-800">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-xs text-zinc-400">Total Campus Events</CardDescription>
                        <CardTitle className="text-3xl font-bold text-white">{totalEvents}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-[11px] text-zinc-500">
                        Across all campus clubs
                    </CardContent>
                </Card>
            </div>

            {/* Section 1: Pending Club Approvals Queue */}
            {pendingClubs.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
                        <h2 className="text-lg font-bold text-white">Pending Club Applications ({pendingClubs.length})</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingClubs.map((club) => {
                            const leadOrganizer = club.host_users?.[0];
                            return (
                                <Card key={club.id} className="bg-zinc-950 border-amber-500/30">
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start gap-2">
                                            <div>
                                                <CardTitle className="text-base font-bold text-white">{club.name}</CardTitle>
                                                
                                            </div>
                                            <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">
                                                Pending Review
                                            </Badge>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="space-y-3 text-xs">
                                        {club.description && (
                                            <p className="text-zinc-400 text-xs italic bg-zinc-900/50 p-2 rounded border border-zinc-800/80">
                                                &ldquo;{club.description}&rdquo;
                                            </p>
                                        )}

                                        <div className="space-y-1 text-zinc-300">
                                            <div className="flex justify-between">
                                                <span className="text-zinc-500">Applicant:</span>
                                                <span className="font-medium text-white">{leadOrganizer?.full_name || "N/A"}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-zinc-500">Username:</span>
                                                <span className="font-mono text-zinc-300">{leadOrganizer?.username || "N/A"}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-zinc-500">Email:</span>
                                                <span className="text-zinc-300">{club.contact_email || leadOrganizer?.email || "N/A"}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                                            <Button
                                                size="sm"
                                                onClick={() => handleToggleVerification(club.id, false)}
                                                disabled={processingId === club.id}
                                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9"
                                            >
                                                {processingId === club.id ? "Processing..." : "✓ Approve Club"}
                                            </Button>

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleDeleteClub(club.id, club.name)}
                                                disabled={processingId === club.id}
                                                className="border-zinc-800 bg-zinc-900 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs h-9"
                                            >
                                                Reject
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Section 2: Active Verified Clubs */}
            <div className="space-y-4">
                <h2 className="text-lg font-bold text-white">Active Campus Clubs ({verifiedClubs.length})</h2>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[11px]">
                                <tr>
                                    <th className="py-3 px-4">Club Name</th>
                                    
                                    <th className="py-3 px-4">Lead Organizer</th>
                                    <th className="py-3 px-4">Events</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60">
                                {verifiedClubs.map((club) => {
                                    const leadOrganizer = club.host_users?.[0];
                                    const isPrimaryOrg = club.slug === "github-community";

                                    return (
                                        <tr key={club.id} className="hover:bg-zinc-900/40 transition-colors">
                                            <td className="py-3 px-4 font-semibold text-white">
                                                {club.name}
                                                {isPrimaryOrg && (
                                                    <span className="ml-2 text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
                                                        Primary Host
                                                    </span>
                                                )}
                                            </td>
                                                                                        <td className="py-3 px-4 text-zinc-300">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-medium text-white">{leadOrganizer?.full_name || "N/A"}</span>
                                                    {leadOrganizer?.username && (
                                                        <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                                            @{leadOrganizer.username}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{leadOrganizer?.email}</div>
                                            </td>
                                            <td className="py-3 px-4 text-zinc-300 font-mono">
                                                {club.events?.length || 0} hunts
                                            </td>
                                            <td className="py-3 px-4">
                                                <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                                                    Verified
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 text-right space-x-2">
                                                {!isPrimaryOrg && (
                                                    <>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleToggleVerification(club.id, true)}
                                                            disabled={processingId === club.id}
                                                            className="text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-7 px-2"
                                                        >
                                                            Revoke
                                                        </Button>

                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteClub(club.id, club.name)}
                                                            disabled={processingId === club.id}
                                                            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2"
                                                        >
                                                            Delete
                                                        </Button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
