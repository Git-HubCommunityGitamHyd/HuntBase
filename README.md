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
- 📊 **Live Monitoring** - Admin dashboard refreshes from the database every five seconds
- 📱 **Mobile-First Scanner** - Zero-latency camera scanning with Safari/Android lifecycle protection

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **Database** | Neon (PostgreSQL) with Drizzle ORM |
| **Styling** | Tailwind CSS v4 & shadcn/ui |
| **QR Scanning** | html5-qrcode (optimized lifecycle) |
| **QR Generation** | qrcode (server-side SVG/PNG) |
| **Deployment** | Vercel |

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- npm
- Neon account

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

3. **Set up Neon**
   - Create a PostgreSQL database on [Neon](https://neon.tech).
   - Add the pooled and direct connection URLs to `.env.local`:
     ```env
     DATABASE_URL=your_pooled_neon_connection_string
     DATABASE_URL_DIRECT=your_direct_neon_connection_string
     SEED_ADMIN_USERNAME=admin
     SEED_ADMIN_EMAIL=admin@example.com
     SEED_ADMIN_PASSWORD=a_long_unique_password
     OTP_SECRET=at_least_32_random_characters
     GITAM_EMAIL_DOMAIN=student.gitam.edu
     RESEND_API_KEY=your_resend_api_key
     EMAIL_FROM=HuntBase <noreply@your-verified-domain.example>
     NEXT_PUBLIC_APP_URL=http://localhost:3000
     ```
   - In development, if `RESEND_API_KEY` is unset, the verification code is printed to the server terminal. Production requires a configured email provider.
   - Run `npm run db:migrate` and `npm run db:seed`.

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
│   └── types.ts         # TypeScript data contracts
├── db/                  # Neon PostgreSQL schema and Drizzle connection
└── proxy.ts             # Route protection & HttpOnly cookie guards
```

## 🎮 How It Works

### Player Flow
1. A player registers with individual credentials for an open team, then logs in with that username and password. Username matching is case-insensitive.
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
