# 🌿 CarbonLens — Personal Carbon Footprint Tracker

> Track, understand, and reduce your personal carbon footprint with AI-powered insights.

![CarbonLens](https://img.shields.io/badge/CarbonLens-v2.0-2D6A4F?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

---

## 🚀 Features

| Feature | Description |
|---|---|
| 🔐 Secure Auth | Register & login with bcrypt password hashing |
| 📋 Footprint Quiz | 5-question onboarding quiz to estimate your baseline |
| 📝 Activity Logging | Log travel, food, energy and shopping emissions |
| 📊 7-Day Chart | Visual bar chart of your weekly CO₂ trend |
| 🤖 AI Tips | Personalised reduction tips based on your data |
| 🎯 Action Pledges | Pledge actions and see exact kg CO₂ saved |
| 📋 Full History | View, edit and delete all activity records |
| ⚙️ Settings | Update profile, footprint estimate, retake quiz |
| 📱 Mobile Responsive | Works on all screen sizes with bottom navigation |

---

## 🔒 Security

- **bcryptjs** — passwords hashed with cost factor 12
- **helmet** — secure HTTP headers (XSS, clickjacking, MIME sniffing)
- **express-rate-limit** — max 10 login attempts per 15 minutes
- **xss** — all user input sanitized before storage
- **httpOnly cookies** — session cookies inaccessible to JavaScript
- **Input validation** — email format, field lengths, numeric ranges

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js + Express.js |
| Database | JSON file storage (persistent) |
| Charts | Chart.js |
| Security | bcryptjs, helmet, express-rate-limit, xss |

---

## ⚡ Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/carbonlens.git
cd carbonlens

# 2. Install dependencies
npm install

# 3. Start the server
npm start

# 4. Open in browser
# http://localhost:3000
```

---

## 📁 Project Structure

```
carbonlens/
├── server/
│   └── index.js          # Express backend with all API routes
├── public/
│   ├── index.html        # Single-page HTML shell
│   ├── css/
│   │   ├── base.css      # Reset, variables, utilities
│   │   ├── auth.css      # Login, register, quiz styles
│   │   ├── dashboard.css # Sidebar, cards, tables
│   │   └── components.css # Toast, modal, badge, gauge
│   └── js/
│       ├── api.js        # All HTTP calls to backend
│       ├── data.js       # Categories, actions, quiz data
│       ├── ui.js         # Toast, modal, DOM helpers
│       ├── screens.js    # All screen renderers
│       └── app.js        # Auth routing and app boot
├── package.json
└── carbonlens-data.json  # Auto-created data file
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/register | Create new account |
| POST | /api/auth/login | Sign in |
| POST | /api/auth/logout | Sign out |
| GET | /api/auth/me | Get current session |
| PUT | /api/user/footprint | Update annual estimate |
| GET | /api/logs | Get all activity logs |
| POST | /api/logs | Add new log entry |
| PUT | /api/logs/:id | Edit a log entry |
| DELETE | /api/logs/:id | Delete a log entry |
| GET | /api/pledges | Get pledged actions |
| PUT | /api/pledges | Update pledges |
| GET | /api/stats | Get dashboard statistics |
| GET | /api/health | Server health check |

---

## 📊 Judging Criteria Coverage

| Criteria | Implementation |
|---|---|
| **Code Quality** | Separated files, clean structure, Chart.js, AI tips |
| **Security** | Helmet + rate limiting + XSS + bcrypt + httpOnly |
| **Efficiency** | In-memory cache, async writes, parallel API calls |
| **Testing** | Full working app, health endpoint, error states |
| **Accessibility** | ARIA labels, keyboard nav, mobile responsive, skip links |

---

## 🏆 Built for PromptWars — Google for Developers

Challenge: Carbon Footprint Awareness Platform

---

**NOTE : "Deployed on Render free tier — first load may take 30 seconds to wake up."**

*Made with 🌱 by Mohammed Jaffer*
