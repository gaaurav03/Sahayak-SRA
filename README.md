# 🆘 Sahayak — Smart Resource Allocator

<div align="center">
  <p align="center">
    <b>Empowering Communities through Data-Driven Crisis Response & Resource Management</b>
    <br />
    <a href="https://github.com/gaaurav03/Sahayak-SRA"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="#-features">Features</a>
    ·
    <a href="#-tech-stack">Tech Stack</a>
    ·
    <a href="#-getting-started">Getting Started</a>
  </p>
</div>

---

## 📖 Overview

**Sahayak** is a sophisticated community intelligence platform designed to bridge the gap between grassroots field data and effective volunteer response. It digitizes crisis reporting, ranks needs using a weighted urgency scoring engine, and matches volunteers to tasks through a complex skill-proximity-availability algorithm.

Inspired by the professional and high-contrast design of **NGO Darpan**, Sahayak provides a premium, state-of-the-art interface for NGO coordinators, volunteers, and field reporters to manage social impact at scale.

---

## ✨ Features

### 🏛️ For Coordinators
- **Intelligent Needs Dashboard**: Real-time overview of all reported needs, automatically ranked by a 0-10 urgency score.
- **Smart Matching Engine**: One-click volunteer assignment based on skill overlap, geographic proximity, and current workload.
- **Advanced Analytics**: Visualized operational pulse showing need resolution snapshots and recent task activity.
- **Geographic Map View**: Live interactive map (Leaflet-powered) showing the spread of needs colour-coded by priority.

### 👷 For Field Reporters
- **Rapid Submission Flow**: Mobile-first, high-performance form for submitting needs in under 2 minutes.
- **Nested Task Tracking**: View tasks and their statuses directly nested under the parent needs for clear visibility.
- **Premium Profile Management**: Integrated profile management using Clerk.

### 🤝 For Volunteers
- **Personalized Task Inbox**: Skill-matched tasks delivered directly to a clean, focused dashboard.
- **Activity History**: Complete audit trail of past deployments and verified impact.
- **Real-time Map**: Browse nearby opportunities and community needs on an interactive map.

---

## 🛠 Tech Stack

| Technology | Purpose |
| :--- | :--- |
| **Next.js 14** | Modern React framework with App Router and SSR |
| **Node.js/Express** | High-performance REST API architecture |
| **Supabase** | Scalable PostgreSQL database with Real-time capabilities |
| **Clerk** | Secure, premium authentication and user management |
| **Tailwind CSS** | Utility-first styling for a sleek, responsive UI |
| **Leaflet.js** | Geographic mapping and spatial visualization |
| **Pnpm** | Fast, disk-efficient package management |

---

## 🚀 End-to-End Flow

1. **Submit Need**: Field Worker submits a report (e.g., "Ward 7 — No clean water").
2. **Rank**: System automatically computes an urgency score (e.g., 8.7/10) based on severity and affected population.
3. **Taskify**: Coordinator creates a specific task (e.g., "Water Distribution") from the need.
4. **Match**: Algorithm suggests the top 3 volunteers based on skills and location.
5. **Assign**: Coordinator assigns a volunteer with one click.
6. **Complete**: Volunteer marks the task as complete from their phone.
7. **Verify**: Coordinator verifies the work, automatically resolving the linked need.

---

## 🏁 Getting Started

### Prerequisites
- [Node.js 20+](https://nodejs.org/)
- [Pnpm](https://pnpm.io/)
- [Supabase Account](https://supabase.com/)
- [Clerk Account](https://clerk.dev/)

### Local Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/gaaurav03/Sahayak-SRA.git
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables**
   
   Create `.env.local` in `apps/web` and `.env` in `apps/api` using the `.env.example` templates provided.

4. **Initialize Database**
   - Run the schema in `apps/api/supabase/schema.sql` in your Supabase SQL editor.
   - Run any necessary migrations from the `supabase` folder.

5. **Seed Demo Data**
   ```bash
   pnpm --filter @sahayak/api seed
   ```

6. **Run the Development Server**
   ```bash
   pnpm dev
   ```

- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:3001`

---

## 🎨 UI Design Philosophy

Sahayak follows a **Premium NGO Aesthetic**, featuring:
- **Sticky Frosted-Glass Headers**: Inspired by top-tier government portals.
- **Dynamic Sidebars**: SVG-icon enriched navigation with smooth hover transitions.
- **Glassmorphism Analytics**: Beautifully grouped metric cards and charts.
- **High-Contrast Badges**: Instant visual identification of urgency and status.

---

<div align="center">
  <sub>Built with ❤️ for Social Impact by the Sahayak Team.</sub>
</div>
