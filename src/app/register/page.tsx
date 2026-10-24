"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface AvailableTeam {
    id: string;
    team_name: string;
    event_id: string;
    event_name: string;
    organization?: {
        id: string;
        name: string;
        slug: string;
    } | null;
    current_members: number;
    max_players: number;
}

function RegisterForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const eventIdFromUrl = searchParams.get("event_id") || "";

    const [teams, setTeams] = useState<AvailableTeam[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string>(eventIdFromUrl || "all");
    const [selectedTeam, setSelectedTeam] = useState("");
    const [playerName, setPlayerName] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [fetchingTeams, setFetchingTeams] = useState(true);

    useEffect(() => {
        const fetchAvailableTeams = async () => {
            try {
                const url = eventIdFromUrl
                    ? `/api/teams/available?event_id=${encodeURIComponent(eventIdFromUrl)}`
                    : "/api/teams/available";
                const response = await fetch(url);
                const data = await response.json();
                if (data.success) {
                    setTeams(data.data || []);
                    if (eventIdFromUrl) {
                        setSelectedEventId(eventIdFromUrl);
                    }
                }
            } catch (err) {
                console.error("Error fetching teams:", err);
            } finally {
                setFetchingTeams(false);
            }
        };

        fetchAvailableTeams();
    }, [eventIdFromUrl]);

    // Extract unique active events from the available teams
    const availableEvents = useMemo(() => {
        const eventsMap = new Map<string, { id: string; name: string; orgName?: string }>();
        teams.forEach((t) => {
            if (!eventsMap.has(t.event_id)) {
                eventsMap.set(t.event_id, {
                    id: t.event_id,
                    name: t.event_name,
                    orgName: t.organization?.name,
                });
            }
        });
        return Array.from(eventsMap.values());
    }, [teams]);

    // Filter teams by chosen event
    const filteredTeams = useMemo(() => {
        if (!selectedEventId || selectedEventId === "all") {
            return teams;
        }
        return teams.filter((t) => t.event_id === selectedEventId);
    }, [teams, selectedEventId]);

    // Group filtered teams by event for hierarchical select display
    const teamsByEvent = useMemo(() => {
        const grouped: Record<string, { eventName: string; orgName?: string; teams: AvailableTeam[] }> = {};
        filteredTeams.forEach((team) => {
            if (!grouped[team.event_id]) {
                grouped[team.event_id] = {
                    eventName: team.event_name,
                    orgName: team.organization?.name,
                    teams: [],
                };
            }
            grouped[team.event_id].teams.push(team);
        });
        return grouped;
    }, [filteredTeams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // Validation
        if (!selectedTeam) {
            setError("Please select a team");
            return;
        }
        if (!playerName.trim()) {
            setError("Please enter your name");
            return;
        }
        if (!username.trim()) {
            setError("Please enter a username");
            return;
        }
        if (password.length < 4) {
            setError("Password must be at least 4 characters");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    team_id: selectedTeam,
                    player_name: playerName.trim(),
                    username: username.trim().toLowerCase(),
                    password,
                }),
            });

            const data = await response.json();

            if (data.success) {
                // Redirect to login with success message
                router.push("/login?registered=true");
            } else {
                setError(data.message || "Registration failed");
            }
        } catch {
            setError("An error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const selectedTeamData = teams.find((t) => t.id === selectedTeam);

    return (
        <Card className="w-full max-w-md bg-zinc-950 border-white/10">
            <CardHeader className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-white rounded-2xl flex items-center justify-center">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8 text-black"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                        />
                    </svg>
                </div>
                <CardTitle className="text-2xl font-bold text-white">
                    Join Your Team
                </CardTitle>
                <CardDescription className="text-gray-400">
                    Register to participate in the scavenger hunt
                </CardDescription>
            </CardHeader>

            <CardContent>
                {fetchingTeams ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                    </div>
                ) : teams.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-400 mb-4">No teams available for registration yet.</p>
                        <p className="text-gray-500 text-sm">Please wait for the organizers to create teams.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <Alert variant="destructive" className="bg-red-500/10 border-red-500/50 text-red-400">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {/* Optional Event Filter when multiple events exist */}
                        {availableEvents.length > 1 && (
                            <div className="space-y-2">
                                <Label htmlFor="event" className="text-gray-300">Select Event</Label>
                                <Select
                                    value={selectedEventId}
                                    onValueChange={(val) => {
                                        setSelectedEventId(val);
                                        // Reset selected team if it doesn't belong to the chosen event
                                        if (val !== "all") {
                                            const teamMatch = teams.find(t => t.id === selectedTeam);
                                            if (teamMatch && teamMatch.event_id !== val) {
                                                setSelectedTeam("");
                                            }
                                        }
                                    }}
                                >
                                    <SelectTrigger className="bg-zinc-900 border-white/10 text-white w-full">
                                        <SelectValue placeholder="All Active Events" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-white/10">
                                        <SelectItem value="all" className="text-white hover:bg-white/10">
                                            All Active Events ({teams.length} teams)
                                        </SelectItem>
                                        {availableEvents.map((ev) => (
                                            <SelectItem key={ev.id} value={ev.id} className="text-white hover:bg-white/10">
                                                {ev.name}{ev.orgName ? ` (${ev.orgName})` : ""}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="team" className="text-gray-300">Select Your Team</Label>
                            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                                <SelectTrigger className="bg-zinc-900 border-white/10 text-white w-full">
                                    <SelectValue placeholder="Choose your team" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-white/10">
                                    {Object.entries(teamsByEvent).map(([eventId, group]) => (
                                        <SelectGroup key={eventId}>
                                            <SelectLabel className="text-gray-400 font-semibold px-2 py-1.5 text-xs bg-zinc-800/40">
                                                📍 {group.eventName}{group.orgName ? ` • ${group.orgName}` : ""}
                                            </SelectLabel>
                                            {group.teams.map((team) => (
                                                <SelectItem
                                                    key={team.id}
                                                    value={team.id}
                                                    className="text-white hover:bg-white/10 pl-4"
                                                    disabled={team.current_members >= team.max_players}
                                                >
                                                    {team.team_name} ({team.current_members}/{team.max_players})
                                                    {team.current_members >= team.max_players && " - Full"}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedTeamData && (
                                <div className="text-xs text-gray-400 space-y-1 bg-white/5 p-2.5 rounded-lg border border-white/5">
                                    <div>
                                        <span className="text-gray-500">Event:</span>{" "}
                                        <span className="text-white font-medium">{selectedTeamData.event_name}</span>
                                        {selectedTeamData.organization?.name && (
                                            <span className="text-gray-400"> ({selectedTeamData.organization.name})</span>
                                        )}
                                    </div>
                                    <div className="text-emerald-400 font-medium">
                                        {selectedTeamData.max_players - selectedTeamData.current_members} spot(s) remaining
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="playerName" className="text-gray-300">Your Name</Label>
                            <Input
                                id="playerName"
                                type="text"
                                placeholder="e.g., Harsha"
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                required
                                className="bg-zinc-900 border-white/10 text-white placeholder:text-gray-500 focus:border-white/30"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="username" className="text-gray-300">Choose a Username</Label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="e.g., harsha_dev"
                                value={username}
                                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                                required
                                className="bg-zinc-900 border-white/10 text-white placeholder:text-gray-500 focus:border-white/30"
                            />
                            <p className="text-xs text-gray-500">Lowercase letters, numbers, and underscores only</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-gray-300">Set Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="bg-zinc-900 border-white/10 text-white placeholder:text-gray-500 focus:border-white/30"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-gray-300">Confirm Password</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="bg-zinc-900 border-white/10 text-white placeholder:text-gray-500 focus:border-white/30"
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-white hover:bg-gray-200 text-black font-semibold py-3"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Registering...
                                </span>
                            ) : (
                                "Register & Join Team"
                            )}
                        </Button>
                    </form>
                )}

                <div className="mt-6 flex flex-col items-center gap-2">
                    <Link
                        href="/login"
                        className="text-sm text-gray-500 hover:text-white"
                    >
                        Already registered? Login →
                    </Link>
                    <Link
                        href="/"
                        className="text-sm text-gray-600 hover:text-white"
                    >
                        Back to Home
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}

export default function RegisterPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4">
            <Suspense fallback={
                <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                </div>
            }>
                <RegisterForm />
            </Suspense>
        </div>
    );
}
