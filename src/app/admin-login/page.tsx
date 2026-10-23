"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AdminLoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingSession, setIsCheckingSession] = useState(true);

    // Auto-detect existing active session and redirect straight to dashboard
    useEffect(() => {
        let isMounted = true;

        async function checkActiveSession() {
            // 1. Check local storage
            const storedAdmin = localStorage.getItem("admin");
            if (storedAdmin) {
                try {
                    const parsed = JSON.parse(storedAdmin);
                    if (isMounted) {
                        if (parsed.role === "super_admin") {
                            router.replace("/super-admin");
                        } else {
                            router.replace("/admin/events");
                        }
                        return;
                    }
                } catch {
                    localStorage.removeItem("admin");
                }
            }

            // 2. Check server session cookie
            try {
                const res = await fetch("/api/auth/me");
                if (res.ok) {
                    const data = await res.json();
                    if (data?.success && data?.admin) {
                        localStorage.setItem("admin", JSON.stringify(data.admin));
                        if (isMounted) {
                            if (data.admin.role === "super_admin") {
                                router.replace("/super-admin");
                            } else {
                                router.replace("/admin/events");
                            }
                            return;
                        }
                    }
                }
            } catch (err) {
                console.error("Session check error:", err);
            }

            if (isMounted) {
                setIsCheckingSession(false);
            }
        }

        checkActiveSession();

        return () => {
            isMounted = false;
        };
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const response = await fetch("/api/auth/admin-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem("admin", JSON.stringify(data.admin));
                if (data.role === "super_admin") {
                    router.push("/super-admin");
                } else {
                    router.push("/admin/events");
                }
            } else {
                setError(data.message || "Invalid credentials");
            }
        } catch {
            setError("An error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    if (isCheckingSession) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4">
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
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                        </svg>
                    </div>
                    <CardTitle className="text-2xl font-bold text-white">
                        HuntBase Admin
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                        Enter club host credentials to manage your hunt
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <Alert variant="destructive" className="bg-red-500/10 border-red-500/50 text-red-400">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="username" className="text-gray-300">Username or Email</Label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="admin"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                className="bg-zinc-900 border-white/10 text-white placeholder:text-gray-500 focus:border-white/30"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-gray-300">Password</Label>
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

                        <Button
                            type="submit"
                            className="w-full bg-white hover:bg-gray-200 text-black font-semibold h-11"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <div className="flex items-center gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent"></div>
                                    <span>Signing in...</span>
                                </div>
                            ) : (
                                "Sign In"
                            )}
                        </Button>
                    </form>

                    <div className="mt-6 pt-4 border-t border-white/10 text-center space-y-2">
                        <p className="text-xs text-zinc-400">
                            Want to host a hunt for your campus club?{" "}
                            <Link href="/register-club" className="text-emerald-400 hover:text-emerald-300 font-medium">
                                Register Club →
                            </Link>
                        </p>
                        <div>
                            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
                                ← Back to Home
                            </Link>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
