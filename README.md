# HuntBase 🎯

A multi-tenant, white-label campus treasure hunt platform built by GitHub Community GITAM. Clubs can launch branded hunts in minutes, complete with dynamic themes, randomized clues, anti-cheat QR verification, real-time live monitoring, and instant leaderboards.

## ✨ Features

- 🏢 **Multi-Tenant Club Architecture** - Host multiple club hunts independently with custom branding
- 🎨 **Dynamic Theme Engine** - Customizable club colors, logos, and banners
- 🔑 **Team & Player Management** - Individual player credentials scoped to events
- 🎲 **Anti-Crowding Round-Robin** - Distributed starting clues prevent clustering
- ⏱️ **Synchronized Hunt Timer** - Admin-controlled live countdown
- 💡 **Timed Hint System** - Time-delayed hints with score penalty balance
- 🎭 **Rickroll Decoy QR Codes** - "Hall of Shame" tracking for decoy scans
- 📊 **Sub-300ms Live Monitoring** - Real-time WebSocket admin dashboard
- 📱 **Mobile-First Scanner** - Zero-latency camera scanning with Safari/Android lifecycle protection

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **Database** | Supabase (PostgreSQL with RLS) |
| **Styling** | Tailwind CSS v4 & shadcn/ui |
| **QR Scanning** | html5-qrcode (optimized lifecycle) |
| **QR Generation** | qrcode (server-side SVG/PNG) |
| **Deployment** | Vercel |

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- npm
- Supabase account

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Git-HubCommunityGitamHyd/HuntBase.git
   cd HuntBase
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase**
   - Create a project on [Supabase](https://supabase.com).
   - Run the master schema in `supabase/schema.sql` via the Supabase SQL Editor or:
     ```bash
     node scripts/migrate.js
     ```
   - Add environment variables to `.env.local`:
     ```env
     NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     NEXT_PUBLIC_APP_URL=http://localhost:3000
     ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open the app**
   - Player Portal: [http://localhost:3000/login](http://localhost:3000/login)
   - Club Admin Dashboard: [http://localhost:3000/admin-login](http://localhost:3000/admin-login)

## 📁 Project Structure

```
src/
├── app/
│   ├── admin/           # Host & club admin dashboards (Monitor, Clues, QR Codes, Theme)
│   ├── api/             # Secure server routes (Auth, Scans, Hunt, Uploads)
│   ├── hunt/            # Player riddle and clues interface
│   ├── login/           # Player login
│   ├── scan/            # Native camera QR scanner
│   └── progress/        # Team leaderboard & progress
├── components/ui/       # shadcn/ui primitives
├── contexts/            # React contexts (AuthContext, ThemeContext)
├── lib/
│   ├── auth/            # Session token verification
│   ├── supabase/        # Supabase client / admin client
│   └── types.ts         # TypeScript data contracts
└── middleware.ts        # Route protection & HttpOnly cookie guards
```

## 🎮 How It Works

### Player Flow
1. Player logs in with their team credentials.
2. Views their current clue (riddle).
3. Solves the riddle and navigates to the physical location.
4. Scans the checkpoint QR code.
5. If valid: earns points, logs checkpoint, and advances to next riddle.

### Scoring
- **10 points** - Solved without using hint
- **5 points** - Solved after viewing hint

### Club Host Flow
1. Create hunt event with countdown duration and hint delays.
2. Add clues, locations, and optional hints.
3. Generate and batch download printable QR codes.
4. Customize club colors, banners, and logos.
5. Start the hunt (triggers real-time timer and randomizes team clue orders).
6. Live monitor teams, scans, and decoy traps in real time.

## 📄 License

MIT

---

*Built with ❤️ by GitHub Community GITAM*
