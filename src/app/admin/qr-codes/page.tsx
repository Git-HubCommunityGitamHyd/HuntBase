"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/dialog";
import QRCodeLib from "qrcode";
import type { Event, Clue, QRCode } from "@/lib/types";

interface FakeQRForm {
    label: string;
    redirect_url: string;
}

interface QRPreview {
    type: 'clue' | 'fake';
    title: string;
    url: string;
    dataUrl: string;
}

export default function QRCodesPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<string>("");
    const [clues, setClues] = useState<Clue[]>([]);
    const [fakeQRs, setFakeQRs] = useState<QRCode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [creatingFake, setCreatingFake] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [qrPreview, setQrPreview] = useState<QRPreview | null>(null);
    const [fakeForm, setFakeForm] = useState<FakeQRForm>({
        label: "",
        redirect_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    useEffect(() => {
        fetchEvents();
    }, []);

    useEffect(() => {
        if (selectedEvent) {
            fetchClues();
            fetchFakeQRs();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const fetchClues = async () => {
        try {
            const response = await fetch(`/api/admin/clues?event_id=${selectedEvent}`);
            const data = await response.json();
            if (data.success) {
                setClues(data.data || []);
            }
        } catch (err) {
            console.error("Fetch clues error:", err);
        }
    };

    const fetchFakeQRs = async () => {
        try {
            const response = await fetch(`/api/admin/qr/fake?event_id=${selectedEvent}`);
            const data = await response.json();
            if (data.success) {
                setFakeQRs(data.data || []);
            }
        } catch (err) {
            console.error("Fetch fake QRs error:", err);
        }
    };

    const createFakeQR = async () => {
        if (!fakeForm.label.trim() || !fakeForm.redirect_url.trim()) {
            setError("Please fill in both label and redirect URL");
            return;
        }

        setCreatingFake(true);
        setError("");
        setSuccess("");

        try {
            const response = await fetch("/api/admin/qr/fake", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    event_id: selectedEvent,
                    label: fakeForm.label,
                    redirect_url: fakeForm.redirect_url,
                }),
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || "Failed to create fake QR");
            }

            setSuccess(`Fake QR "${fakeForm.label}" created successfully!`);
            setFakeForm({ label: "", redirect_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
            fetchFakeQRs();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to create fake QR code";
            setError(message);
            console.error(err);
        } finally {
            setCreatingFake(false);
        }
    };

    const deleteFakeQR = async (id: string) => {
        if (!confirm("Are you sure you want to delete this fake QR?")) return;

        try {
            const response = await fetch(`/api/admin/qr/fake?id=${id}`, {
                method: "DELETE",
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || "Failed to delete fake QR");
            }

            setSuccess("Fake QR deleted");
            fetchFakeQRs();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to delete fake QR";
            setError(message);
        }
    };

    const generateQRCodes = async () => {
        setGenerating(true);
        setError("");
        setSuccess("");

        try {
            const response = await fetch("/api/admin/qr/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ event_id: selectedEvent }),
            });

            const data = await response.json();

            if (data.success) {
                setSuccess(data.message);

                // Download zip file
                const binaryString = atob(data.zipBase64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: "application/zip" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `qr_codes_${new Date().toISOString().split("T")[0]}.zip`;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                setError(data.message);
            }
        } catch {
            setError("Failed to generate QR codes");
        } finally {
            setGenerating(false);
        }
    };

    const previewClueQR = async (clue: Clue) => {
        try {
            // Fetch the QR token for this clue
            const response = await fetch(`/api/admin/qr/token?clue_id=${clue.id}`);
            const qrData = await response.json();
            
            if (!qrData.success) {
                throw new Error(qrData.message);
            }
            
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
            const scanUrl = `${appUrl}/scan?token=${qrData.token}`;
            
            const dataUrl = await QRCodeLib.toDataURL(scanUrl, {
                width: 400,
                margin: 2,
                color: {
                    dark: "#1e1e2e",
                    light: "#ffffff",
                },
            });

            setQrPreview({
                type: 'clue',
                title: clue.location_name || `Clue ${clue.step_number}`,
                url: scanUrl,
                dataUrl,
            });
        } catch (err) {
            console.error('Preview error:', err);
            setError('Failed to generate preview');
        }
    };

    const previewFakeQR = async (qr: QRCode) => {
        try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
            const scanUrl = `${appUrl}/scan?token=${qr.qr_token}`;
            
            const dataUrl = await QRCodeLib.toDataURL(scanUrl, {
                width: 400,
                margin: 2,
                color: {
                    dark: "#dc2626", // Red for fake
                    light: "#ffffff",
                },
            });

            setQrPreview({
                type: 'fake',
                title: qr.fake_label || 'Fake QR',
                url: scanUrl,
                dataUrl,
            });
        } catch (err) {
            console.error('Preview error:', err);
            setError('Failed to generate preview');
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
            <div>
                <h1 className="text-3xl font-bold text-white">QR Codes</h1>
                <p className="text-gray-400 mt-1">Generate and download QR codes for clues</p>
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

            {/* Generate QR Codes */}
            <Card className="bg-zinc-900/50 border-white/10">
                <CardHeader>
                    <CardTitle className="text-white">Generate QR Codes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-gray-400">
                        This will generate a QR code for each clue in the selected event. The QR codes will be downloaded as a ZIP file containing PNG images.
                    </p>

                    <div className="flex items-center gap-4">
                        <Button
                            onClick={generateQRCodes}
                            disabled={generating || clues.length === 0}
                            className="bg-white hover:bg-gray-200 text-black"
                        >
                            {generating ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Generating...
                                </span>
                            ) : (
                                "Generate & Download ZIP"
                            )}
                        </Button>
                        <span className="text-gray-400 text-sm">
                            {clues.length} clue{clues.length !== 1 ? "s" : ""} will be included
                        </span>
                    </div>
                </CardContent>
            </Card>

            {/* Clues Preview */}
            <Card className="bg-zinc-900/50 border-white/10">
                <CardHeader>
                    <CardTitle className="text-white">Clues to Generate</CardTitle>
                </CardHeader>
                <CardContent>
                    {clues.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">
                            No clues found for this event. Add clues first before generating QR codes.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {clues.map((clue) => (
                                <div
                                    key={clue.id}
                                    className="flex items-center gap-4 p-3 rounded-lg bg-black/50"
                                >
                                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">
                                        {clue.step_number}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white truncate">{clue.location_name || `Clue ${clue.step_number}`}</p>
                                        <p className="text-gray-500 text-sm truncate">{clue.clue_text}</p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => previewClueQR(clue)}
                                        className="border-white/20 text-white hover:bg-white/10"
                                    >
                                        Preview
                                    </Button>
                                    <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                    </svg>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Fake QR Codes Section */}
            <Card className="bg-zinc-900/50 border-red-500/30">
                <CardHeader>
                    <CardTitle className="text-red-400 flex items-center gap-2">
                        <span>🎭</span> Fake QR Codes (Hall of Shame)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-gray-400 text-sm">
                        Create fake QR codes that redirect players to any URL (rickrolls, memes, etc.).
                        Players who scan these will be added to the &quot;Hall of Shame&quot;!
                    </p>

                    {/* Create Fake QR Form */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-black/50 rounded-lg">
                        <div>
                            <Label className="text-gray-300">Label</Label>
                            <Input
                                placeholder="e.g., Rickroll 1"
                                value={fakeForm.label}
                                onChange={(e) => setFakeForm({ ...fakeForm, label: e.target.value })}
                                className="bg-zinc-900 border-white/10 text-white"
                            />
                        </div>
                        <div>
                            <Label className="text-gray-300">Redirect URL</Label>
                            <Input
                                placeholder="https://..."
                                value={fakeForm.redirect_url}
                                onChange={(e) => setFakeForm({ ...fakeForm, redirect_url: e.target.value })}
                                className="bg-zinc-900 border-white/10 text-white"
                            />
                        </div>
                        <div className="flex items-end">
                            <Button
                                onClick={createFakeQR}
                                disabled={creatingFake}
                                className="bg-red-600 hover:bg-red-700 text-white w-full"
                            >
                                {creatingFake ? "Creating..." : "Create Fake QR"}
                            </Button>
                        </div>
                    </div>

                    {/* List of Fake QRs */}
                    {fakeQRs.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-white font-medium">Existing Fake QRs</h4>
                            {fakeQRs.map((qr) => (
                                <div
                                    key={qr.id}
                                    className="flex items-center gap-4 p-3 rounded-lg bg-red-950/30 border border-red-500/20"
                                >
                                    <span className="text-2xl">🎭</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-red-300 font-medium">{qr.fake_label}</p>
                                        <p className="text-gray-500 text-sm truncate">{qr.redirect_url}</p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => previewFakeQR(qr)}
                                        className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                                    >
                                        Preview
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => deleteFakeQR(qr.id)}
                                        className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                                    >
                                        Delete
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* QR Preview Dialog */}
            <Dialog open={!!qrPreview} onOpenChange={(open) => !open && setQrPreview(null)}>
                <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-white">
                            {qrPreview?.type === 'fake' ? '🎭 ' : ''}
                            {qrPreview?.title}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            {qrPreview?.type === 'fake' ? 'Fake QR Code Preview' : 'Clue QR Code Preview'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-4 py-4">
                        {qrPreview?.dataUrl && (
                            <>
                                <div className={`p-4 bg-white rounded-lg ${qrPreview.type === 'fake' ? 'ring-2 ring-red-500' : ''}`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img 
                                        src={qrPreview.dataUrl} 
                                        alt="QR Code Preview" 
                                        className="w-64 h-64"
                                    />
                                </div>
                                <div className="w-full">
                                    <Label className="text-gray-400 text-sm">Scan URL:</Label>
                                    <p className="text-xs text-gray-500 break-all mt-1 bg-black/50 p-2 rounded">
                                        {qrPreview.url}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const link = document.createElement('a');
                                        link.download = `${qrPreview.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
                                        link.href = qrPreview.dataUrl;
                                        link.click();
                                    }}
                                    className="border-white/20 text-white hover:bg-white/10"
                                >
                                    Download QR Code
                                </Button>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
