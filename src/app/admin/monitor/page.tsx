"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { Event, Team, Scan, Clue, FakeQRScan, QRCode } from "@/lib/types";
import { formatDateTime } from "@/lib/utils/helpers";

interface TeamWithScan extends Team {
    lastScan?: Scan;
}

interface FakeQRScanWithDetails extends FakeQRScan {
    team?: Team;
    qr_code?: QRCode;
}

export default function MonitorPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<string>("");
    const [teams, setTeams] = useState<TeamWithScan[]>([]);
    const [clues, setClues] = useState<Clue[]>([]);
    const [totalClues, setTotalClues] = useState(0);
    const [showClueReference, setShowClueReference] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [fakeQRScans, setFakeQRScans] = useState<FakeQRScanWithDetails[]>([]);

    const fetchTeams = useCallback(async () => {
        if (!selectedEvent) return;
        const response = await fetch(`/api/admin/monitor?event_id=${encodeURIComponent(selectedEvent)}`, { cache: "no-store" });
        const data = await response.json();
        if (!data.success) return;
        setTeams(data.teams);
        setClues(data.clues);
        setTotalClues(data.totalClues);
        setFakeQRScans(data.fakeScans);
    }, [selectedEvent]);

    const fetchEvents = useCallback(async () => {
        const response = await fetch("/api/admin/events", { cache: "no-store" });
        const result = await response.json();
        const data = result.success ? result.data as Event[] : [];
        setEvents(data || []);

        setSelectedEvent((current) => current && data.some((event) => event.id === current)
            ? current
            : data.find((event) => event.is_active)?.id || data[0]?.id || "");
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchEvents();
    }, []);

    useEffect(() => {
        if (selectedEvent) {
            void fetchTeams();
            const interval = setInterval(() => { void fetchTeams(); void fetchEvents(); }, 5000);
            return () => clearInterval(interval);
        }
    }, [selectedEvent, fetchTeams, fetchEvents]);

    // Timer effect - updates every second when hunt is active
    useEffect(() => {
        const activeEvent = events.find((e) => e.id === selectedEvent);

        if (!activeEvent?.hunt_started_at) {
            setTimeRemaining(null);
            return;
        }

        const huntDuration = (activeEvent.hunt_duration_minutes || 60) * 60 * 1000;
        const huntStartTime = new Date(activeEvent.hunt_started_at).getTime();
        const huntEndTime = huntStartTime + huntDuration;

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, huntEndTime - now);
            setTimeRemaining(remaining);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [events, selectedEvent]);

    const toggleDisqualify = async (team: Team) => {
        await fetch("/api/admin/teams", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: team.id, is_disqualified: !team.is_disqualified }) });
        fetchTeams();
    };

    const adjustScore = async (teamId: string, adjustment: number) => {
        const team = teams.find((t) => t.id === teamId);
        if (!team) return;

        try {
            const response = await fetch("/api/admin/teams/score", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    team_id: teamId,
                    adjustment: adjustment,
                }),
            });

            const data = await response.json();
            if (!data.success) {
                console.error("Failed to adjust score:", data.message);
                alert(data.message || "Failed to adjust score");
            }
            // Refresh teams data
            fetchTeams();
        } catch (error) {
            console.error("Error adjusting score:", error);
            alert("Failed to adjust score");
        }
    };

    const endEvent = async () => {
        if (!confirm("Are you sure you want to end this event? This will deactivate it.")) return;

        await fetch("/api/admin/events", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedEvent, is_active: false }) });
        fetchEvents();
    };

    const formatTimeRemaining = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    const activeEvent = events.find((e) => e.id === selectedEvent);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        Live Monitor
                        <span className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                    </h1>
                    <p className="text-gray-400 mt-1">Real-time team progress tracking</p>
                </div>

                {activeEvent?.is_active && (
                    <Button variant="destructive" onClick={endEvent}>
                        End Event
                    </Button>
                )}
            </div>

            {/* Event Selector */}
            <div className="w-64">
                <Label className="text-gray-300">Select Event</Label>
                <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                    <SelectTrigger className="bg-zinc-900 border-white/10 text-white">
                        <SelectValue placeholder="Select an event" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-white/10">
                        {events.map((event) => (
                            <SelectItem key={event.id} value={event.id} className="text-white hover:bg-slate-700">
                                {event.name} {event.is_active && "🟢"}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Live Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-zinc-900/50 border-white/10">
                    <CardContent className="pt-6 text-center">
                        <div className="text-3xl font-bold text-white">{teams.length}</div>
                        <p className="text-sm text-gray-400">Teams</p>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/10">
                    <CardContent className="pt-6 text-center">
                        <div className="text-3xl font-bold text-green-400">
                            {teams.filter((t) => t.current_step >= totalClues && totalClues > 0).length}
                        </div>
                        <p className="text-sm text-gray-400">Finished</p>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/10">
                    <CardContent className="pt-6 text-center">
                        <div className="text-3xl font-bold text-white">{totalClues}</div>
                        <p className="text-sm text-gray-400">Total Clues</p>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-white/10">
                    <CardContent className="pt-6 text-center">
                        <div className="text-3xl font-bold text-red-400">
                            {teams.filter((t) => t.is_disqualified).length}
                        </div>
                        <p className="text-sm text-gray-400">Disqualified</p>
                    </CardContent>
                </Card>
            </div>

            {/* Hunt Timer Status */}
            {activeEvent && (
                <Card className={`border ${!activeEvent.hunt_started_at
                    ? 'bg-gray-900/50 border-gray-700'
                    : timeRemaining === 0
                        ? 'bg-red-900/30 border-red-500/50'
                        : timeRemaining && timeRemaining < 5 * 60 * 1000
                            ? 'bg-yellow-900/30 border-yellow-500/50'
                            : 'bg-green-900/30 border-green-500/50'
                    }`}>
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="text-lg font-semibold">
                                    {!activeEvent.hunt_started_at ? (
                                        <span className="text-gray-400">⏸️ Hunt Not Started</span>
                                    ) : timeRemaining === 0 ? (
                                        <span className="text-red-400">⏰ Time&apos;s Up!</span>
                                    ) : (
                                        <span className="text-green-400">🎮 Hunt LIVE</span>
                                    )}
                                </div>
                                {activeEvent.hunt_started_at && (
                                    <div className="text-sm text-gray-400">
                                        Started: {formatDateTime(activeEvent.hunt_started_at)}
                                    </div>
                                )}
                            </div>
                            {activeEvent.hunt_started_at && timeRemaining !== null && timeRemaining > 0 && (
                                <div className={`text-3xl font-mono font-bold ${timeRemaining < 5 * 60 * 1000 ? 'text-yellow-400 animate-pulse' : 'text-white'
                                    }`}>
                                    ⏱️ {formatTimeRemaining(timeRemaining)}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Clue Answer Reference */}
            <Card className="bg-amber-900/20 border-amber-700/50">
                <CardHeader className="cursor-pointer" onClick={() => setShowClueReference(!showClueReference)}>
                    <CardTitle className="text-amber-400 flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            🔑 Clue Answer Reference
                            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/50">
                                {clues.filter(c => c.admin_notes).length} answers
                            </Badge>
                        </span>
                        <span className="text-lg">{showClueReference ? "▼" : "▶"}</span>
                    </CardTitle>
                </CardHeader>
                {showClueReference && (
                    <CardContent className="pt-0">
                        {clues.length === 0 ? (
                            <p className="text-amber-300/60 text-center py-4">No clues configured for this event</p>
                        ) : (
                            <div className="space-y-3">
                                {clues.map((clue) => (
                                    <div
                                        key={clue.id}
                                        className="p-3 rounded-lg bg-black/50 border border-amber-700/30"
                                    >
                                        <div className="flex items-start gap-3">
                                            <Badge className="bg-white/20 text-white border-white/50 shrink-0">
                                                Step {clue.step_number}
                                            </Badge>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-gray-300 text-sm">{clue.clue_text}</p>
                                                {clue.location_name && (
                                                    <p className="text-xs text-white mt-1">📍 {clue.location_name}</p>
                                                )}
                                                {clue.admin_notes ? (
                                                    <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
                                                        <p className="text-xs text-amber-400 font-medium">Answer:</p>
                                                        <p className="text-amber-200 font-medium">{clue.admin_notes}</p>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-gray-500 mt-2 italic">No answer configured</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                )}
            </Card>

            {/* Teams Table */}
            <Card className="bg-zinc-900/50 border-white/10">
                <CardHeader>
                    <CardTitle className="text-white">Team Progress</CardTitle>
                </CardHeader>
                <CardContent>
                    {teams.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">No teams in this event</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-gray-400 border-b border-white/10">
                                        <th className="text-left pb-3">#</th>
                                        <th className="text-left pb-3">Team</th>
                                        <th className="text-left pb-3">Score</th>
                                        <th className="text-left pb-3">Progress</th>
                                        <th className="text-left pb-3">Last Scan</th>
                                        <th className="text-left pb-3">Status</th>
                                        <th className="text-right pb-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {teams.map((team, index) => (
                                        <tr
                                            key={team.id}
                                            className={`border-b border-white/10 ${team.is_disqualified ? "opacity-50" : ""
                                                }`}
                                        >
                                            <td className="py-3">
                                                <span
                                                    className={`font-bold ${index === 0
                                                        ? "text-yellow-400"
                                                        : index === 1
                                                            ? "text-gray-300"
                                                            : index === 2
                                                                ? "text-orange-400"
                                                                : "text-gray-500"
                                                        }`}
                                                >
                                                    {index + 1}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                <span className="text-white font-medium">{team.team_name}</span>
                                            </td>
                                            <td className="py-3">
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => adjustScore(team.id, -5)}
                                                        className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                                                    >
                                                        -
                                                    </Button>
                                                    <span className="font-bold text-white w-8 text-center">{team.score}</span>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => adjustScore(team.id, 5)}
                                                        className="h-6 w-6 p-0 text-green-400 hover:text-green-300"
                                                    >
                                                        +
                                                    </Button>
                                                </div>
                                            </td>
                                            <td className="py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-24 bg-slate-700 rounded-full h-2">
                                                        <div
                                                            className="bg-white h-2 rounded-full transition-all"
                                                            style={{
                                                                width: `${totalClues > 0 ? (team.current_step / totalClues) * 100 : 0}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="text-gray-400 text-xs">
                                                        {team.current_step}/{totalClues}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3 text-gray-400 text-xs">
                                                {team.lastScan ? formatDateTime(team.lastScan.scanned_at) : "-"}
                                            </td>
                                            <td className="py-3">
                                                {team.is_disqualified ? (
                                                    <Badge variant="destructive">DQ</Badge>
                                                ) : team.current_step >= totalClues && totalClues > 0 ? (
                                                    <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                                                        🏆 Done
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                                                        Active
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="py-3 text-right">
                                                <Button
                                                    size="sm"
                                                    variant={team.is_disqualified ? "default" : "destructive"}
                                                    onClick={() => toggleDisqualify(team)}
                                                    className="text-xs"
                                                >
                                                    {team.is_disqualified ? "Reinstate" : "DQ"}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Hall of Shame - Fake QR Scans */}
            {fakeQRScans.length > 0 && (
                <Card className="bg-red-950/30 border-red-500/30">
                    <CardHeader>
                        <CardTitle className="text-red-400 flex items-center gap-2">
                            <span>🎭</span> Hall of Shame
                            <Badge className="bg-red-500/30 text-red-300 ml-2">
                                {fakeQRScans.length} victims
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {fakeQRScans.map((scan) => (
                                <div
                                    key={scan.id}
                                    className="flex items-center gap-4 p-3 rounded-lg bg-black/50 border border-red-500/20"
                                >
                                    <span className="text-2xl">😈</span>
                                    <div className="flex-1">
                                        <p className="text-white font-medium">
                                            {scan.team?.team_name || "Unknown Team"}
                                        </p>
                                        <p className="text-red-400 text-sm">
                                            Fell for: {scan.qr_code?.fake_label || "Unknown Trap"}
                                        </p>
                                    </div>
                                    <div className="text-gray-500 text-sm">
                                        {formatDateTime(scan.scanned_at)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
