import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils/helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("name, description")
    .eq("slug", slug)
    .maybeSingle();

  if (!org) {
    return { title: "Club Not Found - HuntBase" };
  }

  return {
    title: `${org.name} - Campus Treasure Hunts | HuntBase`,
    description: org.description || `Play real-time campus treasure hunts hosted by ${org.name}.`,
  };
}

export default async function ClubPortalPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createAdminClient();

  // 1. Fetch Organization
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, description, logo_url, banner_url, contact_email, is_verified, created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (!org) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black p-6 text-center text-white">
        <div className="mx-auto w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-2xl mb-4">
          🔍
        </div>
        <h1 className="text-2xl font-bold">Club Not Found</h1>
        <p className="text-zinc-400 text-sm max-w-sm mt-2">
          No campus club is registered with the slug <span className="font-mono text-white">/{slug}</span>.
        </p>
        <div className="flex gap-3 mt-6">
          <Link href="/">
            <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-200 text-xs">
              ← Return Home
            </Button>
          </Link>
          <Link href="/register-club">
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs">
              Register Club →
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // 2. Fetch Theme Config
  const { data: theme } = await supabase
    .from("theme_configs")
    .select("primary_color, accent_color, background_color, card_color, text_color, border_radius")
    .eq("organization_id", org.id)
    .maybeSingle();

  const primaryColor = theme?.primary_color || "#22c55e";
  const accentColor = theme?.accent_color || "#10b981";
  const cardColor = theme?.card_color || "#18181b";
  const borderRadius = theme?.border_radius || "0.5rem";

  // 3. Fetch Events for this Club
  const { data: events } = await supabase
    .from("events")
    .select("id, name, start_time, end_time, is_active, hunt_status, hunt_duration_minutes")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  const activeEvent = events?.find((e) => e.is_active || e.hunt_status === "active") || events?.[0];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between">
      <div>
        {/* Club Header Banner */}
        <div className="relative h-48 sm:h-64 w-full bg-zinc-900 border-b border-white/10 overflow-hidden">
          {org.banner_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.banner_url} alt={org.name} className="h-full w-full object-cover" />
          ) : (
            <div
              className="h-full w-full opacity-30"
              style={{
                background: `radial-gradient(circle at 50% 30%, ${primaryColor} 0%, transparent 70%)`,
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        </div>

        {/* Club Profile & Showcase Container */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-16 sm:-mt-20 relative z-10 space-y-8">
          {/* Club Identity Header */}
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 text-center sm:text-left">
            {/* Logo */}
            <div
              className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl border-2 border-white/10 bg-zinc-950 p-2 shadow-2xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{ borderRadius }}
            >
              {org.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.logo_url} alt={org.name} className="h-full w-full object-contain" />
              ) : (
                <span className="text-3xl font-black" style={{ color: primaryColor }}>
                  {org.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            {/* Club Info */}
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{org.name}</h1>
                {org.is_verified && (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] px-2 py-0.5">
                    ✓ Verified Club
                  </Badge>
                )}
              </div>

              <p className="text-xs text-zinc-400 font-mono">
                huntbase.app/{org.slug}
              </p>

              {org.description && (
                <p className="text-xs sm:text-sm text-zinc-300 max-w-xl leading-relaxed">
                  {org.description}
                </p>
              )}
            </div>
          </div>

          {/* Featured Hunt Section */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🎯</span> Treasure Hunts
              </h2>
              <span className="text-xs text-zinc-500">Live Campus Events</span>
            </div>

            {activeEvent ? (
              <Card
                className="border border-white/10 overflow-hidden"
                style={{ backgroundColor: cardColor, borderRadius }}
              >
                <CardHeader className="pb-3 border-b border-white/5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl font-bold text-white">{activeEvent.name}</CardTitle>
                        {activeEvent.hunt_status === "active" ? (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] animate-pulse">
                            🟢 Hunt Active Now
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-white/20 text-zinc-300 text-[10px]">
                            Scheduled Hunt
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs text-zinc-400 mt-1">
                        Organized exclusively by {org.name}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-400 bg-white/5 px-2.5 py-1 rounded">
                        ⏱️ {activeEvent.hunt_duration_minutes || 60} mins duration
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-black/40 p-3.5 rounded-lg border border-white/5">
                    <div>
                      <span className="text-zinc-500 block text-[11px]">Start Time</span>
                      <span className="font-medium text-white">{formatDateTime(activeEvent.start_time)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[11px]">End Time</span>
                      <span className="font-medium text-white">{formatDateTime(activeEvent.end_time)}</span>
                    </div>
                  </div>

                  {/* Action CTA Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <Link href={`/login`} className="flex-1">
                      <Button
                        className="w-full font-semibold text-xs h-11 transition-all shadow-lg text-black"
                        style={{
                          backgroundColor: primaryColor,
                          borderRadius,
                        }}
                      >
                        Player Login & Enter Hunt →
                      </Button>
                    </Link>

                    <Link href={`/register`} className="flex-1">
                      <Button
                        variant="outline"
                        className="w-full font-medium text-xs h-11 border-white/20 bg-white/5 hover:bg-white/10 text-white"
                        style={{ borderRadius }}
                      >
                        Register New Team
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border border-white/10 bg-zinc-950 p-8 text-center" style={{ borderRadius }}>
                <div className="text-3xl mb-2">⏳</div>
                <h3 className="text-base font-bold text-white">No Active Hunts Currently</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                  {org.name} is preparing their next campus adventure. Stay tuned or contact the organizers!
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-20 py-8 border-t border-white/10 text-center text-xs text-zinc-500 space-y-2">
        <p>
          Powered by <strong className="text-zinc-300">HuntBase 🎯</strong> — Built by GitHub Community GITAM
        </p>
        <p>
          Club Organizer?{" "}
          <Link href="/admin-login" className="text-zinc-400 hover:text-white underline">
            Manage your hunt dashboard →
          </Link>
        </p>
      </footer>
    </div>
  );
}
