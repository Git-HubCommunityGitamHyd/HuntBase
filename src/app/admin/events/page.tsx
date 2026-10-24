"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { Event } from "@/lib/types";
import { formatDateTime } from "@/lib/utils/helpers";

// Generate all 24 hours (00-23)
const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
// Generate all minutes (00-59)
const allMinutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

// Get today's date in YYYY-MM-DD format for min attribute
const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
};

export default function EventsPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        start_date: "",
        start_hour: "09",
        start_minute: "00",
        end_date: "",
        end_hour: "17",
        end_minute: "00",
        hunt_duration_minutes: "60",
        hint_delay_minutes: "5",
    });
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const fetchEvents = async () => {
        try {
            const response = await fetch("/api/admin/events");
            const data = await response.json();
            if (data.success) {
                setEvents(data.data || []);
            }
        } catch (err) {
            console.error("Fetch error:", err);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const parseDateTimeToForm = (dateStr: string) => {
        const date = new Date(dateStr);
        const dateOnly = date.toISOString().split("T")[0];
        const hour = String(date.getHours()).padStart(2, "0");
        const min = String(date.getMinutes()).padStart(2, "0");
        return { date: dateOnly, hour, minute: min };
    };

    const combineDateTime = (date: string, hour: string, minute: string) => {
        return new Date(`${date}T${hour}:${minute}:00`).toISOString();
    };

    // Calculate duration in minutes between start and end
    const calculateDuration = (startDate: string, startHour: string, startMinute: string, 
                                endDate: string, endHour: string, endMinute: string) => {
        if (!startDate || !endDate) return "";
        const start = new Date(`${startDate}T${startHour}:${startMinute}:00`);
        const end = new Date(`${endDate}T${endHour}:${endMinute}:00`);
        const diffMs = end.getTime() - start.getTime();
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return diffMinutes > 0 ? String(diffMinutes) : "";
    };

    // Calculate end date/time based on start and duration
    const calculateEndDateTime = (startDate: string, startHour: string, startMinute: string, durationMinutes: string) => {
        if (!startDate || !durationMinutes) return null;
        const start = new Date(`${startDate}T${startHour}:${startMinute}:00`);
        const end = new Date(start.getTime() + parseInt(durationMinutes) * 60 * 1000);
        return {
            date: end.toISOString().split("T")[0],
            hour: String(end.getHours()).padStart(2, "0"),
            minute: String(end.getMinutes()).padStart(2, "0"),
        };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        
        // Prevent multiple submissions
        if (isSubmitting) return;
        setIsSubmitting(true);

        const startTime = combineDateTime(formData.start_date, formData.start_hour, formData.start_minute);
        const endTime = combineDateTime(formData.end_date, formData.end_hour, formData.end_minute);

        // Validate that start date is not in the past (only for new events)
        if (!editingEvent) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const startDate = new Date(formData.start_date);
            if (startDate < today) {
                setError("Start date cannot be in the past");
                setIsSubmitting(false);
                return;
            }
        }

        // Validate that end time is after start time
        if (new Date(endTime) <= new Date(startTime)) {
            setError("End time must be after start time");
            setIsSubmitting(false);
            return;
        }

        try {
            if (editingEvent) {
                const response = await fetch("/api/admin/events", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: editingEvent.id,
                        name: formData.name,
                        start_time: startTime,
                        end_time: endTime,
                        hunt_duration_minutes: parseInt(formData.hunt_duration_minutes),
                        hint_delay_minutes: parseInt(formData.hint_delay_minutes),
                    }),
                });

                const data = await response.json();
                if (!data.success) {
                    setError(data.message || "Failed to update event");
                    setIsSubmitting(false);
                    return;
                }
                setSuccess("Event updated successfully!");
            } else {
                const response = await fetch("/api/admin/events", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: formData.name,
                        start_time: startTime,
                        end_time: endTime,
                        hunt_duration_minutes: parseInt(formData.hunt_duration_minutes),
                        hint_delay_minutes: parseInt(formData.hint_delay_minutes),
                    }),
                });

                const data = await response.json();
                if (!data.success) {
                    setError(data.message || "Failed to create event");
                    setIsSubmitting(false);
                    return;
                }
                setSuccess("Event created successfully!");
            }

            setIsDialogOpen(false);
            resetForm();
            fetchEvents();
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            console.error("Submit error:", err);
            setError("Failed to save event");
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({
            name: "",
            start_date: "",
            start_hour: "09",
            start_minute: "00",
            end_date: "",
            end_hour: "17",
            end_minute: "00",
            hunt_duration_minutes: "60",
            hint_delay_minutes: "5",
        });
        setEditingEvent(null);
        setIsSubmitting(false);
    };

    const openEditDialog = (event: Event) => {
        setEditingEvent(event);
        const start = parseDateTimeToForm(event.start_time);
        const end = parseDateTimeToForm(event.end_time);
        setFormData({
            name: event.name,
            start_date: start.date,
            start_hour: start.hour,
            start_minute: start.minute,
            end_date: end.date,
            end_hour: end.hour,
            end_minute: end.minute,
            hunt_duration_minutes: String(event.hunt_duration_minutes || 60),
            hint_delay_minutes: String(event.hint_delay_minutes || 5),
        });
        setIsDialogOpen(true);
    };

    const openCreateDialog = () => {
        resetForm();
        setIsDialogOpen(true);
    };

    const startHunt = async (event: Event) => {
        if (!confirm(`Start the hunt for "${event.name}"? All teams will be able to begin playing.`)) return;

        try {
            const response = await fetch("/api/admin/events/start-hunt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ event_id: event.id }),
            });

            const data = await response.json();
            if (data.success) {
                setSuccess("Hunt started! All teams can now play.");
                fetchEvents();
                setTimeout(() => setSuccess(""), 3000);
            } else {
                setError(data.message || "Failed to start hunt");
            }
        } catch (err) {
            console.error("Start hunt error:", err);
            setError("Failed to start hunt");
        }
    };

    const stopHunt = async (event: Event) => {
        if (!confirm(`Stop the hunt for "${event.name}"? This will end the game for all teams.`)) return;

        try {
            const response = await fetch("/api/admin/events/stop-hunt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ event_id: event.id }),
            });

            const data = await response.json();
            if (data.success) {
                setSuccess("Hunt stopped!");
                fetchEvents();
                setTimeout(() => setSuccess(""), 3000);
            } else {
                setError(data.message || "Failed to stop hunt");
            }
        } catch (err) {
            console.error("Stop hunt error:", err);
            setError("Failed to stop hunt");
        }
    };

    const toggleActive = async (event: Event) => {
        try {
            await fetch("/api/admin/events", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: event.id, is_active: !event.is_active }),
            });
            fetchEvents();
        } catch (err) {
            console.error("Toggle error:", err);
        }
    };

    const deleteEvent = async (id: string) => {
        if (!confirm("Are you sure? This will delete all teams, clues, and scans for this event.")) {
            return;
        }
        try {
            await fetch(`/api/admin/events?id=${id}`, { method: "DELETE" });
            fetchEvents();
        } catch (err) {
            console.error("Delete error:", err);
        }
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
                    <h1 className="text-3xl font-bold text-white">Events</h1>
                    <p className="text-gray-400 mt-1">Manage treasure hunt events</p>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) {
                        resetForm();
                        setError("");
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-white hover:bg-gray-200 text-black" onClick={openCreateDialog}>
                            + New Event
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-black border-white/10 max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-white">
                                {editingEvent ? "Edit Event" : "Create New Event"}
                            </DialogTitle>
                            <DialogDescription className="text-gray-400 text-sm">
                                {editingEvent
                                    ? "Update the details and schedule for this treasure hunt event."
                                    : "Fill in the details to schedule a new treasure hunt event."}
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-2">
                                <Label className="text-gray-300">Event Name</Label>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Techscapades 4.0 2024"
                                    className="bg-zinc-900 border-white/10 text-white"
                                    required
                                />
                            </div>

                            {/* Start Date/Time */}
                            <div className="space-y-2">
                                <Label className="text-gray-300">Start Date & Time</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="date"
                                        value={formData.start_date}
                                        onChange={(e) => {
                                            const newStartDate = e.target.value;
                                            const endDateTime = calculateEndDateTime(newStartDate, formData.start_hour, formData.start_minute, formData.hunt_duration_minutes);
                                            if (endDateTime) {
                                                setFormData({ 
                                                    ...formData, 
                                                    start_date: newStartDate,
                                                    end_date: endDateTime.date,
                                                    end_hour: endDateTime.hour,
                                                    end_minute: endDateTime.minute,
                                                });
                                            } else {
                                                setFormData({ ...formData, start_date: newStartDate });
                                            }
                                        }}
                                        min={!editingEvent ? getTodayDate() : undefined}
                                        className="bg-zinc-900 border-white/10 text-white flex-1 [color-scheme:dark]"
                                        required
                                    />
                                    <Select value={formData.start_hour} onValueChange={(v) => {
                                        const endDateTime = calculateEndDateTime(formData.start_date, v, formData.start_minute, formData.hunt_duration_minutes);
                                        if (endDateTime) {
                                            setFormData({ 
                                                ...formData, 
                                                start_hour: v,
                                                end_date: endDateTime.date,
                                                end_hour: endDateTime.hour,
                                                end_minute: endDateTime.minute,
                                            });
                                        } else {
                                            setFormData({ ...formData, start_hour: v });
                                        }
                                    }}>
                                        <SelectTrigger className="w-20 bg-zinc-900 border-white/10 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-white/10 max-h-56">
                                            {hours.map((h) => (
                                                <SelectItem key={h} value={h} className="text-white">{h}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <span className="text-white self-center">:</span>
                                    <Select value={formData.start_minute} onValueChange={(v) => {
                                        const endDateTime = calculateEndDateTime(formData.start_date, formData.start_hour, v, formData.hunt_duration_minutes);
                                        if (endDateTime) {
                                            setFormData({ 
                                                ...formData, 
                                                start_minute: v,
                                                end_date: endDateTime.date,
                                                end_hour: endDateTime.hour,
                                                end_minute: endDateTime.minute,
                                            });
                                        } else {
                                            setFormData({ ...formData, start_minute: v });
                                        }
                                    }}>
                                        <SelectTrigger className="w-20 bg-zinc-900 border-white/10 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-white/10 max-h-56">
                                            {allMinutes.map((m) => (
                                                <SelectItem key={m} value={m} className="text-white">{m}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* End Date/Time */}
                            <div className="space-y-2">
                                <Label className="text-gray-300">End Date & Time</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="date"
                                        value={formData.end_date}
                                        onChange={(e) => {
                                            const newEndDate = e.target.value;
                                            const duration = calculateDuration(formData.start_date, formData.start_hour, formData.start_minute, 
                                                                              newEndDate, formData.end_hour, formData.end_minute);
                                            setFormData({ 
                                                ...formData, 
                                                end_date: newEndDate,
                                                hunt_duration_minutes: duration || formData.hunt_duration_minutes
                                            });
                                        }}
                                        min={formData.start_date || undefined}
                                        className="bg-zinc-900 border-white/10 text-white flex-1 [color-scheme:dark]"
                                        required
                                    />
                                    <Select value={formData.end_hour} onValueChange={(v) => {
                                        const duration = calculateDuration(formData.start_date, formData.start_hour, formData.start_minute, 
                                                                          formData.end_date, v, formData.end_minute);
                                        setFormData({ 
                                            ...formData, 
                                            end_hour: v,
                                            hunt_duration_minutes: duration || formData.hunt_duration_minutes
                                        });
                                    }}>
                                        <SelectTrigger className="w-20 bg-zinc-900 border-white/10 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-white/10 max-h-56">
                                            {hours.map((h) => (
                                                <SelectItem key={h} value={h} className="text-white">{h}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <span className="text-white self-center">:</span>
                                    <Select value={formData.end_minute} onValueChange={(v) => {
                                        const duration = calculateDuration(formData.start_date, formData.start_hour, formData.start_minute, 
                                                                          formData.end_date, formData.end_hour, v);
                                        setFormData({ 
                                            ...formData, 
                                            end_minute: v,
                                            hunt_duration_minutes: duration || formData.hunt_duration_minutes
                                        });
                                    }}>
                                        <SelectTrigger className="w-20 bg-zinc-900 border-white/10 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-white/10 max-h-56">
                                            {allMinutes.map((m) => (
                                                <SelectItem key={m} value={m} className="text-white">{m}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Hunt Settings */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-gray-300">Hunt Duration (min)</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="180"
                                        value={formData.hunt_duration_minutes}
                                        onChange={(e) => {
                                            const newDuration = e.target.value;
                                            const endDateTime = calculateEndDateTime(formData.start_date, formData.start_hour, formData.start_minute, newDuration);
                                            if (endDateTime) {
                                                setFormData({ 
                                                    ...formData, 
                                                    hunt_duration_minutes: newDuration,
                                                    end_date: endDateTime.date,
                                                    end_hour: endDateTime.hour,
                                                    end_minute: endDateTime.minute,
                                                });
                                            } else {
                                                setFormData({ ...formData, hunt_duration_minutes: newDuration });
                                            }
                                        }}
                                        className="bg-zinc-900 border-white/10 text-white"
                                    />
                                    <p className="text-xs text-gray-500">Time teams have to complete</p>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-300">Hint Delay (min)</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="30"
                                        value={formData.hint_delay_minutes}
                                        onChange={(e) => setFormData({ ...formData, hint_delay_minutes: e.target.value })}
                                        className="bg-zinc-900 border-white/10 text-white"
                                    />
                                    <p className="text-xs text-gray-500">Wait before hints available</p>
                                </div>
                            </div>

                            <Button 
                                type="submit" 
                                className="w-full bg-white hover:bg-gray-200 text-black"
                                disabled={isSubmitting}
                            >
                                {isSubmitting 
                                    ? (editingEvent ? "Updating..." : "Creating...") 
                                    : (editingEvent ? "Update Event" : "Create Event")
                                }
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {success && (
                <Alert className="bg-green-500/10 border-green-500/50 text-green-400">
                    <AlertDescription>{success}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-4">
                {events.length === 0 ? (
                    <Card className="bg-zinc-900/50 border-white/10">
                        <CardContent className="py-12 text-center">
                            <p className="text-gray-400">No events yet. Create your first event!</p>
                        </CardContent>
                    </Card>
                ) : (
                    events.map((event) => {
                        const isHuntStarted = !!event.hunt_started_at;
                        const huntEndTime = isHuntStarted
                            ? new Date(new Date(event.hunt_started_at!).getTime() + (event.hunt_duration_minutes || 60) * 60 * 1000)
                            : null;
                        const isHuntEnded = huntEndTime ? new Date() > huntEndTime : false;

                        return (
                            <Card key={event.id} className="bg-zinc-900/50 border-white/10">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-white flex items-center gap-3 flex-wrap">
                                        {event.name}
                                        {event.is_active && (
                                            <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                                                Active
                                            </Badge>
                                        )}
                                        {isHuntStarted && !isHuntEnded && (
                                            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50 animate-pulse">
                                                🎮 Hunt LIVE
                                            </Badge>
                                        )}
                                        {isHuntEnded && (
                                            <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/50">
                                                Hunt Ended
                                            </Badge>
                                        )}
                                    </CardTitle>
                                    <div className="flex gap-2 flex-wrap">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openEditDialog(event)}
                                            className="border-slate-600 text-gray-300 hover:bg-slate-700 hover:text-white"
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant={event.is_active ? "destructive" : "default"}
                                            onClick={() => toggleActive(event)}
                                            className={event.is_active ? "" : "bg-green-600 hover:bg-green-700"}
                                        >
                                            {event.is_active ? "Deactivate" : "Activate"}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteEvent(event.id)}
                                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div>
                                            <span className="text-gray-400">Event Start:</span>
                                            <p className="text-white">{formatDateTime(event.start_time)}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-400">Event End:</span>
                                            <p className="text-white">{formatDateTime(event.end_time)}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-400">Hunt Duration:</span>
                                            <p className="text-white">{event.hunt_duration_minutes || 60} minutes</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-400">Hint Delay:</span>
                                            <p className="text-white">{event.hint_delay_minutes || 5} minutes</p>
                                        </div>
                                    </div>

                                    {/* Hunt Control */}
                                    {event.is_active && (
                                        <div className="pt-4 border-t border-white/10">
                                            {!isHuntStarted ? (
                                                <Button
                                                    onClick={() => startHunt(event)}
                                                    className="w-full md:w-auto bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-3 px-6"
                                                >
                                                    🚀 Start Hunt
                                                </Button>
                                            ) : isHuntEnded ? (
                                                <div className="flex items-center gap-4">
                                                    <span className="text-gray-400">Hunt has ended</span>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => startHunt(event)}
                                                        className="border-slate-600 text-gray-300"
                                                    >
                                                        Restart Hunt
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-4">
                                                    <div className="text-sm">
                                                        <span className="text-gray-400">Started at: </span>
                                                        <span className="text-white">
                                                            {formatDateTime(event.hunt_started_at!)}
                                                        </span>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => stopHunt(event)}
                                                    >
                                                        ⏹️ Stop Hunt
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}
