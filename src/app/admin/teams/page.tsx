"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import type { Event, Team } from "@/lib/types";

interface TeamMember {
    id: string;
    team_id: string;
    player_name: string;
    username: string;
    created_at: string;
}

interface TeamWithMembers extends Team {
    members?: TeamMember[];
}

export default function TeamsPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [teams, setTeams] = useState<TeamWithMembers[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Create team form
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newTeamName, setNewTeamName] = useState("");
    const [minPlayers, setMinPlayers] = useState(2);
    const [maxPlayers, setMaxPlayers] = useState(2);
    const [creating, setCreating] = useState(false);

    // Move player dialog
    const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState<TeamMember | null>(null);
    const [targetTeamId, setTargetTeamId] = useState<string>("");

    // Reset password dialog
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
    const [resetPlayer, setResetPlayer] = useState<TeamMember | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [resetting, setResetting] = useState(false);

    const fetchTeams = useCallback(async () => {
        if (!selectedEvent) return;
        try {
            const response = await fetch(`/api/admin/teams?event_id=${selectedEvent}`);
            const data = await response.json();
            if (data.success) {
                // Fetch members for each team
                const teamsWithMembers = await Promise.all(
                    (data.data || []).map(async (team: Team) => {
                        const membersRes = await fetch(`/api/admin/players?team_id=${team.id}`);
                        const membersData = await membersRes.json();
                        return {
                            ...team,
                            members: membersData.success ? membersData.data : []
                        };
                    })
                );
                setTeams(teamsWithMembers);
            }
        } catch (err) {
            console.error("Fetch teams error:", err);
        }
    }, [selectedEvent]);

    useEffect(() => {
        fetchEvents();
    }, []);

    useEffect(() => {
        if (selectedEvent) {
            fetchTeams();
        }
    }, [selectedEvent, fetchTeams]);

    const fetchEvents = async () => {
        try {
            const response = await fetch("/api/admin/events");
            const data = await response.json();
            if (data.success && data.data?.length > 0) {
                setEvents(data.data);
                setSelectedEvent(data.data[0].id);
            }
        } catch (err) {
            console.error("Fetch events error:", err);
        }
        setIsLoading(false);
    };

    const createTeam = async () => {
        if (!newTeamName.trim()) {
            setError("Team name is required");
            return;
        }

        setCreating(true);
        setError("");

        try {
            const response = await fetch("/api/admin/teams", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    event_id: selectedEvent,
                    team_name: newTeamName.trim(),
                    min_players: minPlayers,
                    max_players: maxPlayers,
                }),
            });

            const data = await response.json();

            if (data.success) {
                setSuccess(`Team "${newTeamName}" created successfully!`);
                setNewTeamName("");
                setMinPlayers(2);
                setMaxPlayers(2);
                setIsCreateDialogOpen(false);
                fetchTeams();
                setTimeout(() => setSuccess(""), 3000);
            } else {
                setError(data.message || "Failed to create team");
            }
        } catch {
            setError("Failed to create team");
        } finally {
            setCreating(false);
        }
    };

    const deleteTeam = async (teamId: string, teamName: string) => {
        if (!confirm(`Are you sure you want to delete "${teamName}"? This will also remove all players in this team.`)) return;

        try {
            await fetch(`/api/admin/teams?id=${teamId}`, { method: "DELETE" });
            fetchTeams();
            setSuccess(`"${teamName}" deleted successfully`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Delete error:", err);
            setError("Failed to delete team");
        }
    };

    const removePlayer = async (player: TeamMember) => {
        if (!confirm(`Remove ${player.player_name} (@${player.username}) from this team? They will need to register again.`)) return;

        try {
            await fetch(`/api/admin/players/${player.id}`, { method: "DELETE" });
            fetchTeams();
            setSuccess(`${player.player_name} removed successfully`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Remove player error:", err);
            setError("Failed to remove player");
        }
    };

    const movePlayer = async () => {
        if (!selectedPlayer || !targetTeamId) return;

        try {
            const response = await fetch(`/api/admin/players/${selectedPlayer.id}/move`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ new_team_id: targetTeamId }),
            });

            const data = await response.json();

            if (data.success) {
                setSuccess(`${selectedPlayer.player_name} moved successfully!`);
                setIsMoveDialogOpen(false);
                setSelectedPlayer(null);
                setTargetTeamId("");
                fetchTeams();
                setTimeout(() => setSuccess(""), 3000);
            } else {
                setError(data.message || "Failed to move player");
            }
        } catch {
            setError("Failed to move player");
        }
    };

    const toggleDisqualify = async (team: Team) => {
        try {
            await fetch("/api/admin/teams", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: team.id, is_disqualified: !team.is_disqualified }),
            });
            fetchTeams();
        } catch (err) {
            console.error("Toggle error:", err);
        }
    };

    const adjustScore = async (teamId: string, adjustment: number) => {
        const team = teams.find((t) => t.id === teamId);
        if (!team) return;

        const newScore = Math.max(0, team.score + adjustment);
        try {
            await fetch("/api/admin/teams", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: teamId, score: newScore }),
            });
            fetchTeams();
        } catch (err) {
            console.error("Score adjust error:", err);
        }
    };

    const openMoveDialog = (player: TeamMember) => {
        setSelectedPlayer(player);
        setTargetTeamId("");
        setIsMoveDialogOpen(true);
    };

    const openResetDialog = (player: TeamMember) => {
        setResetPlayer(player);
        setNewPassword("");
        setIsResetDialogOpen(true);
    };

    const resetPassword = async () => {
        if (!resetPlayer || !newPassword) return;

        setResetting(true);
        try {
            const response = await fetch("/api/admin/players/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ player_id: resetPlayer.id, new_password: newPassword }),
            });

            const data = await response.json();

            if (data.success) {
                setSuccess(`Password reset for ${resetPlayer.player_name} to: ${newPassword}`);
                setIsResetDialogOpen(false);
                setResetPlayer(null);
                setNewPassword("");
                setTimeout(() => setSuccess(""), 5000);
            } else {
                setError(data.message || "Failed to reset password");
            }
        } catch {
            setError("Failed to reset password");
        } finally {
            setResetting(false);
        }
    };

    const exportPlayers = () => {
        window.open(`/api/admin/players/export?event_id=${selectedEvent}`, "_blank");
    };

    // Get teams with room for move dialog
    const teamsWithRoom = teams.filter(t =>
        t.id !== selectedPlayer?.team_id &&
        (t.members?.length || 0) < (t.max_players || 2)
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Teams</h1>
                <p className="text-gray-400 mt-1">Create teams and manage players</p>
            </div>

            {/* Alerts */}
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {success && (
                <Alert className="bg-green-500/10 border-green-500/50 text-green-400">
                    <AlertDescription>{success}</AlertDescription>
                </Alert>
            )}

            {/* Event Selector + Create Team Button */}
            <div className="flex gap-4 items-end">
                <div className="flex-1">
                    <Label className="text-gray-300">Select Event</Label>
                    <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                        <SelectTrigger className="bg-zinc-900 border-white/10 text-white">
                            <SelectValue placeholder="Select an event" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-white/10">
                            {events.map((event) => (
                                <SelectItem key={event.id} value={event.id} className="text-white hover:bg-white/10">
                                    {event.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Button
                    variant="outline"
                    onClick={exportPlayers}
                    disabled={!selectedEvent || teams.length === 0}
                    className="border-slate-600 text-gray-300 hover:bg-slate-700"
                >
                    📥 Export Players CSV
                </Button>

                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-white hover:bg-gray-200 text-black" disabled={!selectedEvent}>
                            + Create Team
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-zinc-900 border-white/10">
                        <DialogHeader>
                            <DialogTitle className="text-white">Create New Team</DialogTitle>
                            <DialogDescription className="text-gray-400 text-sm">
                                Enter team details and maximum player slots for this team.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label className="text-gray-300">Team Name</Label>
                                <Input
                                    value={newTeamName}
                                    onChange={(e) => setNewTeamName(e.target.value)}
                                    placeholder="Enter team name from Google Forms"
                                    className="bg-black border-white/10 text-white"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-gray-300">Min Players</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={minPlayers}
                                        onChange={(e) => setMinPlayers(parseInt(e.target.value) || 1)}
                                        className="bg-black border-white/10 text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-300">Max Players</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={maxPlayers}
                                        onChange={(e) => setMaxPlayers(parseInt(e.target.value) || 2)}
                                        className="bg-black border-white/10 text-white"
                                    />
                                </div>
                            </div>
                            <Button
                                onClick={createTeam}
                                disabled={creating || !newTeamName.trim()}
                                className="w-full bg-white hover:bg-gray-200 text-black"
                            >
                                {creating ? "Creating..." : "Create Team"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Teams List */}
            <div className="space-y-4">
                {teams.length === 0 ? (
                    <Card className="bg-zinc-900/50 border-white/10">
                        <CardContent className="py-12 text-center">
                            <p className="text-gray-400">No teams yet. Create teams from your Google Forms registrations!</p>
                        </CardContent>
                    </Card>
                ) : (
                    teams.map((team) => (
                        <Card key={team.id} className="bg-zinc-900/50 border-white/10">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <CardTitle className="text-white text-lg">{team.team_name}</CardTitle>
                                        <Badge className="bg-white/10 text-gray-300 border-white/20">
                                            {team.members?.length || 0}/{team.max_players || 2} players
                                        </Badge>
                                        {team.is_disqualified && (
                                            <Badge variant="destructive">Disqualified</Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Score */}
                                        <div className="flex items-center gap-1 mr-4">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => adjustScore(team.id, -10)}
                                                className="h-6 w-6 p-0 text-red-400"
                                            >
                                                -
                                            </Button>
                                            <span className="font-bold text-white w-8 text-center">{team.score}</span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => adjustScore(team.id, 10)}
                                                className="h-6 w-6 p-0 text-green-400"
                                            >
                                                +
                                            </Button>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant={team.is_disqualified ? "default" : "destructive"}
                                            onClick={() => toggleDisqualify(team)}
                                        >
                                            {team.is_disqualified ? "Reinstate" : "Disqualify"}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteTeam(team.id, team.team_name)}
                                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {/* Players List */}
                                {team.members && team.members.length > 0 ? (
                                    <div className="space-y-2">
                                        {team.members.map((member) => (
                                            <div
                                                key={member.id}
                                                className="flex items-center justify-between p-3 bg-black/50 rounded-lg"
                                            >
                                                <div>
                                                    <span className="text-white">{member.player_name}</span>
                                                    <span className="text-gray-500 text-sm ml-2">@{member.username}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => openResetDialog(member)}
                                                        className="text-blue-400 hover:text-blue-300"
                                                    >
                                                        🔑 Reset PW
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => openMoveDialog(member)}
                                                        className="text-gray-400 hover:text-white"
                                                    >
                                                        Move
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => removePlayer(member)}
                                                        className="text-red-400 hover:text-red-300"
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-sm">No players registered yet</p>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Move Player Dialog */}
            <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
                <DialogContent className="bg-zinc-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Move Player</DialogTitle>
                        <DialogDescription className="text-gray-400 text-sm">
                            Assign this participant to a different active team.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <p className="text-gray-400">
                            Move <span className="text-white font-medium">{selectedPlayer?.player_name}</span> to a different team:
                        </p>
                        <Select value={targetTeamId} onValueChange={setTargetTeamId}>
                            <SelectTrigger className="bg-black border-white/10 text-white">
                                <SelectValue placeholder="Select target team" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10">
                                {teamsWithRoom.length > 0 ? (
                                    teamsWithRoom.map((team) => (
                                        <SelectItem key={team.id} value={team.id} className="text-white hover:bg-white/10">
                                            {team.team_name} ({team.members?.length || 0}/{team.max_players || 2})
                                        </SelectItem>
                                    ))
                                ) : (
                                    <div className="p-2 text-gray-500 text-sm">No teams with available slots</div>
                                )}
                            </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => setIsMoveDialogOpen(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={movePlayer}
                                disabled={!targetTeamId}
                                className="flex-1 bg-white hover:bg-gray-200 text-black"
                            >
                                Move Player
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Reset Password Dialog */}
            <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                <DialogContent className="bg-zinc-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">🔑 Reset Password</DialogTitle>
                        <DialogDescription className="text-gray-400 text-sm">
                            Set a new temporary password for this team member.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <p className="text-gray-400">
                            Reset password for <span className="text-white font-medium">{resetPlayer?.player_name}</span> (@{resetPlayer?.username})
                        </p>
                        <div className="space-y-2">
                            <Label className="text-gray-300">New Password</Label>
                            <Input
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password (min 4 chars)"
                                className="bg-black border-white/10 text-white"
                            />
                            <p className="text-xs text-gray-500">Tell this password to the player so they can login again.</p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => setIsResetDialogOpen(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={resetPassword}
                                disabled={!newPassword || newPassword.length < 4 || resetting}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {resetting ? "Resetting..." : "Reset Password"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
