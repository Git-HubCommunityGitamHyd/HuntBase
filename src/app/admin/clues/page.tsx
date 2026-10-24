"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { Event, Clue } from "@/lib/types";

export default function CluesPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [clues, setClues] = useState<Clue[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingClue, setEditingClue] = useState<Clue | null>(null);
    const [formData, setFormData] = useState({
        clue_text: "",
        location_name: "",
        hint_text: "",
        admin_notes: "",
    });
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const fetchClues = useCallback(async () => {
        if (!selectedEvent) return;
        try {
            const response = await fetch(`/api/admin/clues?event_id=${selectedEvent}`);
            const data = await response.json();
            if (data.success) {
                setClues(data.data || []);
            }
        } catch (err) {
            console.error("Fetch clues error:", err);
        }
    }, [selectedEvent]);

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

    useEffect(() => {
        fetchEvents();
    }, []);

    useEffect(() => {
        if (selectedEvent) {
            fetchClues();
        }
    }, [selectedEvent, fetchClues]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        try {
            if (editingClue) {
                const response = await fetch("/api/admin/clues", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: editingClue.id,
                        clue_text: formData.clue_text,
                        location_name: formData.location_name || null,
                        hint_text: formData.hint_text || null,
                        admin_notes: formData.admin_notes || null,
                    }),
                });
                const data = await response.json();
                if (!data.success) {
                    setError(data.message || "Failed to update clue");
                    return;
                }
                setSuccess("Clue updated successfully!");
            } else {
                const response = await fetch("/api/admin/clues", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        event_id: selectedEvent,
                        step_number: clues.length + 1,
                        clue_text: formData.clue_text,
                        location_name: formData.location_name || null,
                        hint_text: formData.hint_text || null,
                        admin_notes: formData.admin_notes || null,
                    }),
                });
                const data = await response.json();
                if (!data.success) {
                    setError(data.message || "Failed to create clue");
                    return;
                }
                setSuccess("Clue added successfully!");
            }

            setIsDialogOpen(false);
            setFormData({ clue_text: "", location_name: "", hint_text: "", admin_notes: "" });
            setEditingClue(null);
            fetchClues();
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Submit error:", err);
            setError("An error occurred");
        }
    };

    const deleteClue = async (id: string) => {
        if (!confirm("Are you sure you want to delete this clue?")) return;

        try {
            await fetch(`/api/admin/clues?id=${id}`, { method: "DELETE" });

            // Reorder remaining clues
            const remainingClues = clues.filter((c) => c.id !== id);
            for (let i = 0; i < remainingClues.length; i++) {
                await fetch("/api/admin/clues", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: remainingClues[i].id, step_number: i + 1 }),
                });
            }
            fetchClues();
        } catch (err) {
            console.error("Delete error:", err);
        }
    };

    const moveClue = async (index: number, direction: "up" | "down") => {
        if (direction === "up" && index === 0) return;
        if (direction === "down" && index === clues.length - 1) return;

        const swapIndex = direction === "up" ? index - 1 : index + 1;

        try {
            await fetch("/api/admin/clues", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: clues[index].id, step_number: swapIndex + 1 }),
            });
            await fetch("/api/admin/clues", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: clues[swapIndex].id, step_number: index + 1 }),
            });
            fetchClues();
        } catch (err) {
            console.error("Move error:", err);
        }
    };

    const openEditDialog = (clue: Clue) => {
        setEditingClue(clue);
        setFormData({
            clue_text: clue.clue_text,
            location_name: clue.location_name || "",
            hint_text: clue.hint_text || "",
            admin_notes: clue.admin_notes || "",
        });
        setIsDialogOpen(true);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Clues</h1>
                    <p className="text-gray-400 mt-1">Create and manage treasure hunt clues</p>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) {
                        setEditingClue(null);
                        setFormData({ clue_text: "", location_name: "", hint_text: "", admin_notes: "" });
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-white hover:bg-gray-200 text-black" disabled={!selectedEvent}>
                            + Add Clue
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-black border-white/10">
                        <DialogHeader>
                            <DialogTitle className="text-white">
                                {editingClue ? "Edit Clue" : "Add New Clue"}
                            </DialogTitle>
                            <DialogDescription className="text-gray-400 text-sm">
                                {editingClue
                                    ? "Update clue text, hint, and secret location for this step."
                                    : "Enter the riddle, optional hint, and answer location for this step."}
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-2">
                                <Label className="text-gray-300">Clue Text *</Label>
                                <Textarea
                                    value={formData.clue_text}
                                    onChange={(e) => setFormData({ ...formData, clue_text: e.target.value })}
                                    placeholder="Enter riddle or clue here..."
                                    className="bg-zinc-900 border-white/10 text-white min-h-[120px]"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-gray-300">Location Name (always visible)</Label>
                                <Input
                                    value={formData.location_name}
                                    onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                                    placeholder="e.g., Near Library, Main Building"
                                    className="bg-zinc-900 border-white/10 text-white"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-blue-300">💡 Timed Hint (shown after delay)</Label>
                                <Textarea
                                    value={formData.hint_text}
                                    onChange={(e) => setFormData({ ...formData, hint_text: e.target.value })}
                                    placeholder="This hint will appear after the configured delay... Teams lose 5 points if they use it."
                                    className="bg-blue-900/20 border-blue-700/50 text-blue-100 min-h-[80px] placeholder:text-blue-700/70"
                                />
                                <p className="text-xs text-blue-400">Teams get +5 pts instead of +10 if they use this hint</p>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-gray-300">Admin Notes (answer/hints - only visible to admins)</Label>
                                <Textarea
                                    value={formData.admin_notes}
                                    onChange={(e) => setFormData({ ...formData, admin_notes: e.target.value })}
                                    placeholder="Enter the answer or admin-only notes here..."
                                    className="bg-amber-900/20 border-amber-700/50 text-amber-100 min-h-[80px] placeholder:text-amber-700/70"
                                />
                            </div>

                            <Button type="submit" className="w-full bg-white hover:bg-gray-200 text-black">
                                {editingClue ? "Update Clue" : "Add Clue"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
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
                                {event.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {success && (
                <Alert className="bg-green-500/10 border-green-500/50 text-green-400">
                    <AlertDescription>{success}</AlertDescription>
                </Alert>
            )}

            {/* Clues List */}
            <Card className="bg-zinc-900/50 border-white/10">
                <CardHeader>
                    <CardTitle className="text-white">Clues ({clues.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {clues.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">No clues yet. Add your first clue!</p>
                    ) : (
                        <div className="space-y-3">
                            {clues.map((clue, index) => (
                                <div
                                    key={clue.id}
                                    className="flex items-start gap-4 p-4 rounded-lg bg-black/50 border border-white/10"
                                >
                                    <div className="flex flex-col gap-1">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => moveClue(index, "up")}
                                            disabled={index === 0}
                                            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                                        >
                                            ↑
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => moveClue(index, "down")}
                                            disabled={index === clues.length - 1}
                                            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                                        >
                                            ↓
                                        </Button>
                                    </div>

                                    <Badge className="bg-white/20 text-white border-white/50 h-8 w-8 flex items-center justify-center">
                                        {clue.step_number}
                                    </Badge>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-white whitespace-pre-wrap">{clue.clue_text}</p>
                                        {clue.location_name && (
                                            <p className="text-sm text-white mt-2">📍 {clue.location_name}</p>
                                        )}
                                        {clue.admin_notes && (
                                            <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
                                                <p className="text-xs text-amber-400 font-medium">🔑 Admin Notes:</p>
                                                <p className="text-sm text-amber-300">{clue.admin_notes}</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => openEditDialog(clue)}
                                            className="text-gray-400 hover:text-white"
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteClue(clue.id)}
                                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
