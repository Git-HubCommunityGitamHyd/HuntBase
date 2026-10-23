"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function RegisterClubPage() {
    const [clubName, setClubName] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [fullName, setFullName] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [description, setDescription] = useState("");

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/auth/register-club", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    club_name: clubName,
                    contact_email: contactEmail,
                    full_name: fullName,
                    username,
                    password,
                    description,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setIsSuccess(true);
            } else {
                setError(data.message || "Failed to submit club registration.");
            }
        } catch (err) {
            console.error("Club registration error:", err);
            setError("Network error. Please try again later.");
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black p-4">
                <Card className="w-full max-w-lg bg-zinc-950 border-emerald-500/30 text-center">
                    <CardHeader className="space-y-3">
                        <div className="mx-auto w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-3xl border border-emerald-500/30">
                            ✓
                        </div>
                        <CardTitle className="text-2xl font-bold text-white">
                            Club Application Submitted!
                        </CardTitle>
                        <CardDescription className="text-zinc-400 text-sm leading-relaxed">
                            Thank you for registering <strong className="text-white">{clubName}</strong>. 
                            Your application is now under review by the GitHub Community GITAM Super Admin team.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="rounded-lg bg-zinc-900/80 p-4 border border-zinc-800 text-left space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Club Name:</span>
                                <span className="text-zinc-200 font-medium">{clubName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Lead Organizer:</span>
                                <span className="text-zinc-200">{fullName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Login Username:</span>
                                <span className="text-zinc-200 font-mono">@{username}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Status:</span>
                                <span className="text-amber-400 font-semibold">Pending Verification</span>
                            </div>
                        </div>

                        <p className="text-xs text-zinc-500">
                            Once approved, you will be able to sign in and immediately launch campus hunts for your club.
                        </p>

                        <div className="pt-2">
                            <Link href="/admin-login">
                                <Button className="w-full bg-white hover:bg-gray-200 text-black font-medium">
                                    Return to Admin Login
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4 py-12">
            <Card className="w-full max-w-xl bg-zinc-950 border-white/10">
                <CardHeader className="text-center space-y-2">
                    <div className="inline-block px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium mb-1">
                        Host a Hunt
                    </div>
                    <CardTitle className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                        Register Your Campus Club
                    </CardTitle>
                    <CardDescription className="text-zinc-400 text-sm">
                        Create an account on HuntBase to host branded treasure hunts with automated clues and live leaderboards.
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <Alert variant="destructive" className="bg-red-500/10 border-red-500/50 text-red-400">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {/* Section 1: Club Identity */}
                        <div className="space-y-3 pt-2">
                            <h3 className="text-xs font-semibold uppercase text-zinc-400 tracking-wider">
                                1. Club Details
                            </h3>

                            <div className="space-y-1.5">
                                <Label htmlFor="clubName" className="text-xs text-zinc-300">Club or Organization Name *</Label>
                                <Input
                                    id="clubName"
                                    type="text"
                                    placeholder="e.g. IEEE Student Branch"
                                    value={clubName}
                                    onChange={(e) => setClubName(e.target.value)}
                                    required
                                    className="bg-zinc-900 border-white/10 text-white placeholder:text-zinc-600 focus:border-white/30 text-sm"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="description" className="text-xs text-zinc-300">Short Description (Optional)</Label>
                                <Input
                                    id="description"
                                    type="text"
                                    placeholder="Technical society for engineering students"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="bg-zinc-900 border-white/10 text-white placeholder:text-zinc-600 focus:border-white/30 text-sm"
                                />
                            </div>
                        </div>

                        {/* Section 2: Lead Organizer Credentials */}
                        <div className="space-y-3 pt-4 border-t border-white/10">
                            <h3 className="text-xs font-semibold uppercase text-zinc-400 tracking-wider">
                                2. Lead Organizer Account
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="fullName" className="text-xs text-zinc-300">Organizer Full Name *</Label>
                                    <Input
                                        id="fullName"
                                        type="text"
                                        placeholder="Rahul Sharma"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        required
                                        className="bg-zinc-900 border-white/10 text-white placeholder:text-zinc-600 focus:border-white/30 text-sm"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="contactEmail" className="text-xs text-zinc-300">Official Contact Email *</Label>
                                    <Input
                                        id="contactEmail"
                                        type="email"
                                        placeholder="ieee@gitam.in"
                                        value={contactEmail}
                                        onChange={(e) => setContactEmail(e.target.value)}
                                        required
                                        className="bg-zinc-900 border-white/10 text-white placeholder:text-zinc-600 focus:border-white/30 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="username" className="text-xs text-zinc-300">Login Username *</Label>
                                    <Input
                                        id="username"
                                        type="text"
                                        placeholder="ieee_lead"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                        className="bg-zinc-900 border-white/10 text-white placeholder:text-zinc-600 focus:border-white/30 text-sm"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="password" className="text-xs text-zinc-300">Password (min 6 chars) *</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        className="bg-zinc-900 border-white/10 text-white placeholder:text-zinc-600 focus:border-white/30 text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-4">
                            <Button
                                type="submit"
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-11 transition-colors"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                        <span>Submitting Application...</span>
                                    </div>
                                ) : (
                                    "Submit Club Registration"
                                )}
                            </Button>
                        </div>
                    </form>

                    <div className="mt-6 pt-4 border-t border-white/10 text-center text-xs text-zinc-500">
                        Already have an approved club?{" "}
                        <Link href="/admin-login" className="text-zinc-300 hover:text-white font-medium">
                            Admin Login →
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
