"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { login, isAuthenticated, isLoading: authLoading } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Redirect if already authenticated
    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            const redirectUrl = searchParams.get("redirect") || "/hunt";
            router.push(redirectUrl);
        }
    }, [authLoading, isAuthenticated, router, searchParams]);

    // Check for registration success message
    useEffect(() => {
        if (searchParams.get("registered") === "true") {
            setSuccess("Registration successful! Please login with your credentials.");
        }
    }, [searchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setIsLoading(true);

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: username.toLowerCase(), password }),
            });

            const data = await response.json();

            if (data.success) {
                // Use auth context to login
                login(data.player, data.team);
                const redirectUrl = searchParams.get("redirect") || "/hunt";
                router.push(redirectUrl);
            } else {
                setError(data.message || "Invalid credentials");
            }
        } catch {
            setError("An error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

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
                            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                        />
                    </svg>
                </div>
                <CardTitle className="text-2xl font-bold text-white">
                    Techscapades 4.0
                </CardTitle>
                <CardDescription className="text-gray-400">
                    Enter your credentials to begin the adventure
                </CardDescription>
            </CardHeader>

            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <Alert variant="destructive" className="bg-red-500/10 border-red-500/50 text-red-400">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {success && (
                        <Alert className="bg-green-500/10 border-green-500/50 text-green-400">
                            <AlertDescription>{success}</AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="username" className="text-gray-300">Username</Label>
                        <Input
                            id="username"
                            type="text"
                            placeholder="your_username"
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
                        className="w-full bg-white hover:bg-gray-200 text-black font-semibold py-3"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Logging in...
                            </span>
                        ) : (
                            "Start Hunt"
                        )}
                    </Button>
                </form>

                <div className="mt-6 flex flex-col items-center gap-2">
                    <Link
                        href="/register"
                        className="text-sm text-white hover:underline font-medium"
                    >
                        New player? Register here →
                    </Link>
                    <Link
                        href="/admin-login"
                        className="text-sm text-gray-500 hover:text-white"
                    >
                        Admin Login
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

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4">
            <Suspense fallback={
                <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                </div>
            }>
                <LoginForm />
            </Suspense>
        </div>
    );
}
