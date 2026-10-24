"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Team, Clue, Event, TeamClueOrder } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function HuntPage() {
    const router = useRouter();
    const { team, player, isLoading: authLoading, logout } = useAuth();
    const [localTeam, setLocalTeam] = useState<Team | null>(null);
    const [currentClue, setCurrentClue] = useState<Clue | null>(null);
    const [currentClueOrder, setCurrentClueOrder] = useState<TeamClueOrder | null>(null);
    const [totalClues, setTotalClues] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [event, setEvent] = useState<Event | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

    // Hint system state
    const [hintTimeRemaining, setHintTimeRemaining] = useState<number | null>(null);
    const [showHint, setShowHint] = useState(false);
    const [hintText, setHintText] = useState<string | null>(null);
    const [hintLoading, setHintLoading] = useState(false);

    const fetchEvent = useCallback(async (eventId: string) => {
        try {
            const supabase = createClient();
            const { data } = await supabase
                .from("events")
                .select("*")
                .eq("id", eventId)
                .single();

            if (data) {
                setEvent(data);
            }
        } catch (error) {
            console.error("Error fetching event:", error);
        }
    }, []);

    const fetchCurrentClue = useCallback(async (teamData: Team) => {
        try {
            const response = await fetch("/api/hunt/current-clue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ team_id: teamData.id }),
            });

            const data = await response.json();

            if (data.success) {
                setTotalClues(data.totalClues || 0);
                if (data.event) {
                    setEvent(data.event);
                }

                if (data.isComplete) {
                    setCurrentClue(null);
                    setCurrentClueOrder(null);
                } else {
                    setCurrentClue(data.clue);
                    setCurrentClueOrder(data.clueOrder);

                    if (data.clueOrder?.hint_viewed && data.clue?.hint_text) {
                        setShowHint(true);
                        setHintText(data.clue.hint_text);
                    } else {
                        setShowHint(false);
                        setHintText(null);
                    }
                }
            } else {
                console.warn("Failed to fetch current clue:", data.message);
            }
        } catch (error) {
            console.error("Error fetching current clue:", error);
        }
    }, []);

    useEffect(() => {
        if (authLoading) return;

        if (!team) {
            setIsLoading(false);
            return;
        }

        // Fetch fresh team data from database (in case localStorage is stale)
        const fetchFreshTeamData = async () => {
            const supabase = createClient();
            const { data: freshTeam } = await supabase
                .from("teams")
                .select("*")
                .eq("id", team.id)
                .single();

            if (freshTeam) {
                setLocalTeam(freshTeam);
                localStorage.setItem("team", JSON.stringify(freshTeam));
                // Fetch event first, then clue
                await fetchEvent(freshTeam.event_id);
                fetchCurrentClue(freshTeam);
            } else {
                setLocalTeam(team);
                await fetchEvent(team.event_id);
                fetchCurrentClue(team);
            }
            setIsLoading(false);
        };

        fetchFreshTeamData();

        // Prefetch scan page for faster navigation
        router.prefetch('/scan');

        const supabase = createClient();

        // Subscribe to team updates
        const teamChannel = supabase
            .channel("team-updates")
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "teams",
                    filter: `id=eq.${team.id}`,
                },
                (payload: { new: Team }) => {
                    const updatedTeam = payload.new;
                    setLocalTeam(updatedTeam);
                    localStorage.setItem("team", JSON.stringify(updatedTeam));
                    fetchCurrentClue(updatedTeam);
                }
            )
            .subscribe();

        // Subscribe to event updates (for hunt start/stop)
        const eventChannel = supabase
            .channel("event-updates")
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "events",
                    filter: `id=eq.${team.event_id}`,
                },
                (payload: { new: Event }) => {
                    const updatedEvent = payload.new;
                    setEvent(updatedEvent);
                }
            )
            .subscribe();

        // Subscribe to team_clue_order updates (for hint sync between team members)
        const clueOrderChannel = supabase
            .channel("clue-order-updates")
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "team_clue_order",
                    filter: `team_id=eq.${team.id}`,
                },
                (payload: { new: TeamClueOrder }) => {
                    const updatedClueOrder = payload.new;
                    // Only update if it's the current clue
                    setCurrentClueOrder((prev) => {
                        if (prev && prev.id === updatedClueOrder.id) {
                            // If hint was viewed by another team member, update state
                            if (updatedClueOrder.hint_viewed && !showHint) {
                                setShowHint(true);
                                // Fetch the hint text
                                if (currentClue?.hint_text) {
                                    setHintText(currentClue.hint_text);
                                }
                            }
                            return updatedClueOrder;
                        }
                        return prev;
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(teamChannel);
            supabase.removeChannel(eventChannel);
            supabase.removeChannel(clueOrderChannel);
        };
    }, [authLoading, team, fetchCurrentClue, fetchEvent, router, showHint, currentClue?.hint_text]);

    // Timer effect - updates every second when hunt is active
    useEffect(() => {
        if (!event?.hunt_started_at) {
            setTimeRemaining(null);
            return;
        }

        const huntDuration = (event.hunt_duration_minutes || 60) * 60 * 1000; // in ms
        const huntStartTime = new Date(event.hunt_started_at).getTime();
        const huntEndTime = huntStartTime + huntDuration;

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, huntEndTime - now);
            setTimeRemaining(remaining);
        };

        updateTimer(); // Initial update
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [event?.hunt_started_at, event?.hunt_duration_minutes]);

    // Hint timer effect - countdown until hint becomes available
    useEffect(() => {
        if (!currentClueOrder?.clue_started_at || !event?.hint_delay_minutes || showHint) {
            setHintTimeRemaining(null);
            return;
        }

        const hintDelay = (event.hint_delay_minutes || 5) * 60 * 1000; // in ms
        const clueStartTime = new Date(currentClueOrder.clue_started_at).getTime();
        const hintAvailableTime = clueStartTime + hintDelay;

        const updateHintTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, hintAvailableTime - now);
            setHintTimeRemaining(remaining);
        };

        updateHintTimer();
        const interval = setInterval(updateHintTimer, 1000);

        return () => clearInterval(interval);
    }, [currentClueOrder?.clue_started_at, event?.hint_delay_minutes, showHint]);

    // View hint handler
    const viewHint = async () => {
        if (!localTeam || !currentClue) return;

        setHintLoading(true);
        try {
            const response = await fetch("/api/hints/view", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    team_id: localTeam.id,
                    clue_id: currentClue.id,
                    player_id: player?.id,
                }),
            });

            const data = await response.json();

            if (data.success) {
                setShowHint(true);
                setHintText(data.hint_text || currentClue.hint_text || "No hint available");
            } else {
                alert(data.message || "Failed to view hint");
            }
        } catch (error) {
            console.error("View hint error:", error);
            alert("Failed to view hint");
        } finally {
            setHintLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
    };

    // Format time remaining as MM:SS
    const formatTimeRemaining = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    if (!localTeam) return null;

    // Wait for event data to load before determining hunt state
    if (!event) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    const isHuntStarted = !!event?.hunt_started_at;
    const isHuntTimedOut = timeRemaining !== null && timeRemaining === 0;
    const isHuntComplete = localTeam.current_step >= totalClues && totalClues > 0;
    const isDisqualified = localTeam.is_disqualified;

    return (
        <div className="min-h-screen bg-black p-4">
            <div className="max-w-lg mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-white">{localTeam.team_name}</h1>
                        <p className="text-sm text-gray-400">
                            {player?.player_name && <span className="text-gray-300">{player.player_name}</span>}
                            {player?.player_name && " • "}
                            Score: {localTeam.score} points
                        </p>
                    </div>
                    <Button variant="ghost" onClick={handleLogout} className="text-gray-400 hover:text-white">
                        Logout
                    </Button>
                </div>

                {/* Global Timer - Only show when hunt is active */}
                {isHuntStarted && !isHuntTimedOut && timeRemaining !== null && (
                    <div className={`text-center py-3 px-4 rounded-lg ${timeRemaining < 5 * 60 * 1000
                        ? 'bg-red-500/20 border border-red-500/50'
                        : 'bg-white/5 border border-white/10'
                        }`}>
                        <p className="text-xs text-gray-400 mb-1">⏱️ Time Remaining</p>
                        <p className={`text-2xl font-mono font-bold ${timeRemaining < 5 * 60 * 1000 ? 'text-red-400 animate-pulse' : 'text-white'
                            }`}>
                            {formatTimeRemaining(timeRemaining)}
                        </p>
                    </div>
                )}

                {/* Progress Badge - only show completion/status badges */}
                <div className="flex gap-2 flex-wrap">
                    {isDisqualified && (
                        <Badge variant="destructive">Disqualified</Badge>
                    )}
                    {isHuntComplete && !isDisqualified && (
                        <Badge className="bg-white/10 text-white border-white/30">
                            Hunt Complete! 🎉
                        </Badge>
                    )}
                    {isHuntTimedOut && !isHuntComplete && (
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
                            Time&apos;s Up!
                        </Badge>
                    )}
                </div>

                {/* Main Content */}
                {isDisqualified ? (
                    <Card className="bg-red-500/10 border-red-500/30">
                        <CardContent className="pt-6 text-center">
                            <div className="text-6xl mb-4">🚫</div>
                            <h2 className="text-xl font-bold text-red-400 mb-2">Team Disqualified</h2>
                            <p className="text-gray-400">
                                Your team has been disqualified from this event. Please contact an event organizer for more information.
                            </p>
                        </CardContent>
                    </Card>
                ) : !isHuntStarted ? (
                    <Card className="bg-zinc-950 border-white/10">
                        <CardContent className="pt-6 text-center">
                            <div className="text-6xl mb-4">⏳</div>
                            <h2 className="text-xl font-bold text-white mb-2">Waiting for Hunt to Start</h2>
                            <p className="text-gray-400">
                                The hunt hasn&apos;t started yet. Wait for the organizer to begin the game!
                            </p>
                        </CardContent>
                    </Card>
                ) : isHuntTimedOut && !isHuntComplete ? (
                    <Card className="bg-yellow-500/10 border-yellow-500/30">
                        <CardContent className="pt-6 text-center">
                            <div className="text-6xl mb-4">⏰</div>
                            <h2 className="text-xl font-bold text-yellow-400 mb-2">Time&apos;s Up!</h2>
                            <p className="text-gray-400 mb-4">
                                The hunt has ended. Your final score: {localTeam.score} points
                            </p>
                            <Link href="/progress">
                                <Button className="bg-white hover:bg-gray-200 text-black">
                                    View Your Journey
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : isHuntComplete ? (
                    <Card className="bg-white/5 border-white/20">
                        <CardContent className="pt-6 text-center">
                            <div className="text-6xl mb-4">🏆</div>
                            <h2 className="text-xl font-bold text-white mb-2">Congratulations!</h2>
                            <p className="text-gray-400 mb-4">
                                You&apos;ve completed the treasure hunt with a score of {localTeam.score} points!
                            </p>
                            <Link href="/progress">
                                <Button className="bg-white hover:bg-gray-200 text-black">
                                    View Your Journey
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : currentClue ? (
                    <>
                        <Card className="bg-zinc-950 border-white/10">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                            <span className="text-white font-bold">{localTeam.current_step + 1}</span>
                                        </div>
                                        <CardTitle className="text-lg text-white">Clue {localTeam.current_step + 1} of {totalClues}</CardTitle>
                                    </div>
                                    {showHint && (
                                        <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/50">
                                            Hint Used (-5 pts)
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-wrap">
                                    {currentClue.clue_text}
                                </p>

                                {/* Timed Hint Section */}
                                {currentClue.hint_text && (
                                    <div className="pt-4 border-t border-white/10">
                                        {showHint ? (
                                            <Alert className="bg-blue-500/10 border-blue-500/30">
                                                <AlertDescription className="text-blue-200">
                                                    <span className="font-semibold text-blue-300">💡 Hint: </span>
                                                    {hintText}
                                                </AlertDescription>
                                            </Alert>
                                        ) : hintTimeRemaining === 0 ? (
                                            <Button
                                                onClick={viewHint}
                                                disabled={hintLoading}
                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                                            >
                                                {hintLoading ? "Loading..." : "💡 Show Hint (-5 points)"}
                                            </Button>
                                        ) : hintTimeRemaining !== null ? (
                                            <div className="text-center py-2 px-4 bg-white/5 rounded-lg border border-white/10">
                                                <p className="text-sm text-gray-400">
                                                    💡 Hint available in{" "}
                                                    <span className="font-mono text-white">
                                                        {Math.ceil(hintTimeRemaining / 1000)}s
                                                    </span>
                                                </p>
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Link href="/scan" className="block">
                            <Button className="w-full h-16 text-lg bg-white hover:bg-gray-200 text-black font-semibold">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                </svg>
                                Scan QR Code
                            </Button>
                        </Link>
                    </>
                ) : (
                    <Card className="bg-zinc-950 border-white/10">
                        <CardContent className="pt-6 text-center">
                            <div className="text-6xl mb-4">🎯</div>
                            <h2 className="text-xl font-bold text-white mb-2">Getting Your Clues Ready...</h2>
                            <p className="text-gray-400">
                                The hunt has started! Your first clue is being loaded.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
