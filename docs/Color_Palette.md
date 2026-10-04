# 🎨 Voice Identity Shield — Color Palette Guide

## Brand Theme
Primary identity color: **Royal Green (#00C853)**  
Theme style: **Cybersecurity x AI Futuristic**

This palette ensures a consistent look across the entire Voice Identity Shield MVP — from landing pages to dashboards and alerts.

---

## 🌿 Primary Colors
| Role | Name | HEX | Notes |
|------|------|------|-------|
| Primary | Royal Green | `#00C853` | Main brand color — used for logos, buttons, highlights. |
| Accent | Neon Emerald | `#00FF88` | Glow/hover effects, verification icons, visual pulses. |
| Secondary | Deep Midnight Blue | `#0A0F1C` | Dark foundation color for secure and techy feel. |

---

## ⚫ Backgrounds
| Role | Name | HEX | Notes |
|------|------|------|-------|
| Main Background | Night Void | `#101418` | Use as global background. |
| Card / Panel | Stealth Gray | `#182028` | Slightly lighter tone for containers. |
| Border / Divider | Steel Teal | `#1F2F35` | Subtle separation lines between sections. |

---

## ⚠️ Status & Alerts
| Status | Color | HEX | Use |
|---------|--------|------|----|
| Success (Authentic) | Mint Glow | `#00FF88` | Verified voice or success states. |
| Warning | Cyber Yellow | `#FFD43B` | Uncertain or pending states. |
| Error (Deepfake) | Alert Red | `#FF4D4D` | Detection of forged/suspicious voice. |

---

## ⚪ Text & Typography
| Role | Name | HEX | Notes |
|------|------|------|-------|
| Primary Text | Light Mist | `#E8F1E9` | High-contrast readable text. |
| Secondary Text | Soft Sage | `#9BAEA0` | Subtext and descriptions. |
| Interactive Text | Link Green | `#00C853` | Used for hyperlinks and CTAs. |

---

## 🧠 Design Usage
- **Gradient Example:**  
  `background: linear-gradient(135deg, #00C853, #00FF88);`

- **Glow Effect Example (CSS):**  
  ```css
  box-shadow: 0 0 15px #00C85380, 0 0 30px #00FF8880;



Font Pairing:

Headings: Orbitron or Space Grotesk

Body: Inter or Rubik



Tailwind Configuration Snippet

(Add this to tailwind.config.js for consistency)

theme: {
  extend: {
    colors: {
      primary: '#00C853',
      accent: '#00FF88',
      dark: '#0A0F1C',
      bg: '#101418',
      card: '#182028',
      border: '#1F2F35',
      success: '#00FF88',
      warning: '#FFD43B',
      error: '#FF4D4D',
      text: {
        primary: '#E8F1E9',
        secondary: '#9BAEA0',
      },
    },
  },
}


🧩 UI Examples

Buttons: Green gradient + hover glow

Navbar: Deep midnight background with neon green hover underline

Cards: Stealth gray background + soft glow border

Status badges: Success = Mint Glow / Error = Red Glow

✨ Goal: Maintain a futuristic, trustworthy, and secure visual identity using Royal Green as the core brand color across all UI layers.


