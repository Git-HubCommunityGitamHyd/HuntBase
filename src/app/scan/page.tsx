"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Team } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";

function ScanContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { team, isLoading: authLoading } = useAuth();
    const [localTeam, setLocalTeam] = useState<Team | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string; pointsEarned?: number } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [manualCode, setManualCode] = useState("");
    const [showManualInput, setShowManualInput] = useState(false);
    const [scanLocked, setScanLocked] = useState(false);
    const scannerRef = useRef<HTMLDivElement>(null);
    const html5QrCodeRef = useRef<{ isScanning?: boolean; stop: () => Promise<void>; clear: () => void } | null>(null);
    const lastScannedRef = useRef<string>("");
    const autoProcessedRef = useRef<boolean>(false);

    const stopScanner = useCallback(async () => {
        if (html5QrCodeRef.current) {
            try {
                const scanner = html5QrCodeRef.current;
                if (scanner.isScanning) {
                    await scanner.stop();
                }
                scanner.clear();
            } catch (error) {
                console.warn("Scanner cleanup notice:", error);
            } finally {
                html5QrCodeRef.current = null;
            }
        }
    }, []);

    const processQRCode = useCallback(async (rawText: string) => {
        if (!rawText || isProcessing || scanLocked) return;

        // Extract clean token
        let token = rawText.trim();
        try {
            if (token.includes("token=")) {
                const dummyUrl = token.startsWith("http://") || token.startsWith("https://") 
                    ? token 
                    : `http://localhost/?${token.includes("?") ? token.split("?")[1] : token}`;
                const parsed = new URL(dummyUrl);
                token = parsed.searchParams.get("token") || token;
            }
        } catch {
            // Keep token as is
        }

        // Debounce: ignore same token within 3 seconds
        if (lastScannedRef.current === token) return;
        lastScannedRef.current = token;

        // Lock scanning & halt camera
        setScanLocked(true);
        setIsProcessing(true);
        await stopScanner();
        setIsScanning(false);

        // Haptic feedback if supported
        if (typeof window !== "undefined" && "vibrate" in navigator) {
            try {
                navigator.vibrate([80, 40, 80]);
            } catch {
                // Ignore if not permitted
            }
        }

        const activeTeam = localTeam || team;
        if (!activeTeam) {
            setResult({ success: false, message: "Please log in with your team account first." });
            setIsProcessing(false);
            setScanLocked(false);
            return;
        }

        try {
            const response = await fetch("/api/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, team_id: activeTeam.id }),
            });

            const data = await response.json();

            // Handle fake QR codes (rickrolls)
            if (data.isFake && data.redirect_url) {
                setResult({ success: false, message: data.message });
                setTimeout(() => {
                    window.location.href = data.redirect_url;
                }, 1500);
                return;
            }

            setResult(data);

            if (data.success) {
                const updatedTeam = { 
                    ...activeTeam, 
                    score: data.newScore ?? activeTeam.score, 
                    current_step: data.nextStep ?? activeTeam.current_step 
                };
                localStorage.setItem("team", JSON.stringify(updatedTeam));
                setLocalTeam(updatedTeam);

                setTimeout(() => {
                    router.push("/hunt");
                }, 1800);
            } else {
                // For non-fatal errors (e.g. wrong clue), allow trying again after delay
                setTimeout(() => {
                    setScanLocked(false);
                    lastScannedRef.current = "";
                }, 3000);
            }
        } catch (error) {
            console.error("Scan processing error:", error);
            setResult({ success: false, message: "Network error processing QR code. Please check your connection." });
            setTimeout(() => {
                setScanLocked(false);
                lastScannedRef.current = "";
            }, 3000);
        } finally {
            setIsProcessing(false);
        }
    }, [isProcessing, scanLocked, stopScanner, localTeam, team, router]);

    // Handle authentication & URL token auto-scan
    useEffect(() => {
        if (authLoading) return;

        const tokenFromUrl = searchParams.get("token");

        if (!team) {
            // Save redirect so user is brought back directly to this scan after login
            const redirectUrl = tokenFromUrl 
                ? `/scan?token=${encodeURIComponent(tokenFromUrl)}` 
                : "/scan";
            router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
            return;
        }

        setLocalTeam(team);

        // Auto-process if user opened a scan link via native camera
        if (tokenFromUrl && !autoProcessedRef.current) {
            autoProcessedRef.current = true;
            processQRCode(tokenFromUrl);
        }

        return () => {
            stopScanner();
        };
    }, [authLoading, team, router, searchParams, processQRCode, stopScanner]);

    const startScanner = async () => {
        if (!scannerRef.current) return;

        setResult(null);
        setIsScanning(true);

        try {
            await stopScanner();

            const { Html5Qrcode } = await import("html5-qrcode");
            const html5QrCode = new Html5Qrcode("qr-reader");
            html5QrCodeRef.current = html5QrCode;

            const config = {
                fps: 15,
                qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                    const edgeSize = Math.min(viewfinderWidth, viewfinderHeight);
                    const boxSize = Math.max(200, Math.floor(edgeSize * 0.72));
                    return { width: boxSize, height: boxSize };
                },
                aspectRatio: 1.0,
            };

            await html5QrCode.start(
                { facingMode: "environment" },
                config,
                (decodedText: string) => {
                    processQRCode(decodedText);
                },
                () => {
                    // Silent detection frame error
                }
            );
        } catch (error: unknown) {
            const isNotAllowed = error instanceof Error && error.name === "NotAllowedError";
            console.error("Camera startup error:", error);
            const msg = isNotAllowed 
                ? "Camera permission denied. Please allow camera access in your browser settings." 
                : "Unable to access back camera. You can enter the code manually below.";
            setResult({ success: false, message: msg });
            setIsScanning(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white p-4 flex flex-col justify-between">
            <div className="max-w-md w-full mx-auto space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between pt-2">
                    <Button
                        variant="ghost"
                        onClick={() => {
                            stopScanner();
                            router.push("/hunt");
                        }}
                        className="text-gray-400 hover:text-white pl-0"
                    >
                        ← Back to Clues
                    </Button>
                    <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded-full">
                        {localTeam?.team_name || "HuntBase Scanner"}
                    </span>
                </div>

                <div className="text-center space-y-1">
                    <h1 className="text-2xl font-black tracking-tight text-white">Scan Checkpoint</h1>
                    <p className="text-xs text-gray-400">Scan the QR code at your current target location</p>
                </div>

                {/* Status / Alert Display */}
                {result && (
                    <Alert
                        className={
                            result.success
                                ? "bg-emerald-950/80 border-emerald-500/50 text-emerald-300 shadow-lg shadow-emerald-950/40"
                                : "bg-red-950/80 border-red-500/50 text-red-300 shadow-lg shadow-red-950/40"
                        }
                    >
                        <AlertDescription className="flex items-center gap-2 font-medium text-sm">
                            {result.success ? (
                                <>
                                    <span className="text-lg">✅</span>
                                    <span>{result.message}</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-lg">⚠️</span>
                                    <span>{result.message}</span>
                                </>
                            )}
                        </AlertDescription>
                    </Alert>
                )}

                {/* Scanner Viewport */}
                <Card className="bg-zinc-950 border-white/10 overflow-hidden relative shadow-2xl rounded-2xl">
                    <CardContent className="p-0 relative">
                        <div
                            id="qr-reader"
                            ref={scannerRef}
                            className="w-full aspect-square bg-zinc-900 flex items-center justify-center overflow-hidden"
                        />

                        {/* Standby State Graphic when not scanning */}
                        {!isScanning && !isProcessing && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 p-6 text-center space-y-4">
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl">
                                    📷
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold text-white">Camera Ready</p>
                                    <p className="text-xs text-gray-400 max-w-xs">
                                        Tap below to activate your phone camera and scan the location QR.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Processing Loading Overlay */}
                        {isProcessing && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-6 text-center space-y-3 z-20">
                                <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-sm font-bold text-emerald-400">Validating Checkpoint...</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Primary Action Button */}
                <div className="space-y-3">
                    {result?.success ? (
                        <div className="text-center py-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl animate-pulse">
                            <p className="text-emerald-400 font-semibold text-sm">Redirecting to next clue...</p>
                        </div>
                    ) : result && !result.success ? (
                        <Button
                            onClick={() => {
                                setResult(null);
                                setScanLocked(false);
                                lastScannedRef.current = "";
                                startScanner();
                            }}
                            className="w-full h-13 text-base bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/30"
                        >
                            🔄 Try Scanning Again
                        </Button>
                    ) : !isScanning ? (
                        <Button
                            onClick={startScanner}
                            className="w-full h-13 text-base bg-white hover:bg-gray-100 text-black font-bold rounded-xl shadow-lg transition-transform active:scale-[0.98]"
                        >
                            Start Camera Scanner
                        </Button>
                    ) : (
                        <Button
                            onClick={async () => {
                                await stopScanner();
                                setIsScanning(false);
                            }}
                            variant="outline"
                            className="w-full h-13 text-base border-white/20 text-gray-300 hover:bg-white/10 rounded-xl"
                        >
                            Pause Camera
                        </Button>
                    )}
                </div>

                {/* Manual Code Input Option */}
                <div className="pt-2 border-t border-white/10">
                    <Button
                        variant="ghost"
                        onClick={() => setShowManualInput(!showManualInput)}
                        className="w-full text-gray-400 text-xs hover:text-white"
                    >
                        {showManualInput ? "▲ Hide manual entry" : "▼ Can't scan? Enter code manually"}
                    </Button>

                    {showManualInput && (
                        <div className="mt-3 space-y-2 p-3 bg-zinc-900/80 border border-white/10 rounded-xl">
                            <p className="text-xs text-gray-400 font-medium">
                                If the physical QR is damaged, enter the token text printed below the QR code:
                            </p>
                            <div className="flex gap-2">
                                <Input
                                    value={manualCode}
                                    onChange={(e) => setManualCode(e.target.value)}
                                    placeholder="e.g. QR_ABC12345678"
                                    className="bg-black border-white/20 text-white font-mono text-sm uppercase"
                                />
                                <Button
                                    onClick={() => {
                                        if (manualCode.trim()) {
                                            processQRCode(manualCode.trim());
                                            setManualCode("");
                                        }
                                    }}
                                    disabled={!manualCode.trim() || isProcessing}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                                >
                                    Verify
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer status */}
            <div className="text-center py-3 text-[11px] text-gray-500">
                HuntBase Engine • Secure Scavenger Hunt System
            </div>
        </div>
    );
}

export default function ScanPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">Loading scanner...</div>}>
            <ScanContent />
        </Suspense>
    );
}
