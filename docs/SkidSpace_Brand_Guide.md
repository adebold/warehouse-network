# SkidSpace — Brand Guide + Source Assets
**Version:** 1.0  
**Style:** Flat · Ultra-Simple · Marketplace-First  
**Audience:** Web · Maps · App · SEO · Agentic Code

---

## 1. Brand Overview

**SkidSpace** is a location-based marketplace for warehouse and pallet space — the *Airbnb for warehouses*.

Brand principles:
- Map-first discovery
- Trust and operational clarity
- Extreme legibility at small sizes

---

## 2. Color System (Authoritative)

```css
--ss-blue: #0B5FFF;
--ss-orange: #FF8A1F;
--ss-ink: #0B1220;
--ss-slate: #475569;
--ss-border: #E2E8F0;
--ss-bg: #FFFFFF;
--ss-bg-muted: #F8FAFC;
```

Rules:
- No gradients
- No shadows on logos
- No recoloring icons

---

## 3. Typography

```css
font-family:
  Inter,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

| Use | Weight |
|---|---|
| Headings | 600 |
| Body | 400 |
| Buttons | 500 |

---

## 4. Logo System

### 4.1 Icon-Only (Core Asset)

Use for:
- App icon
- Map pins
- Favicons

**File:** `logo-icon.svg`

```svg
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <path d="M128 16C77 16 36 56 36 107c0 61 92 133 92 133s92-72 92-133C220 56 179 16 128 16z" fill="#0B5FFF"/>
  <path d="M88 96h80v44H88z" rx="6" fill="#FFFFFF"/>
  <path d="M88 128h80v12H88z" fill="#FF8A1F"/>
</svg>
```

---

### 4.2 Map Pin — Active

```svg
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <path d="M128 16C77 16 36 56 36 107c0 61 92 133 92 133s92-72 92-133C220 56 179 16 128 16z" fill="#FF8A1F"/>
  <path d="M88 96h80v44H88z" rx="6" fill="#FFFFFF"/>
  <path d="M88 128h80v12H88z" fill="#0B5FFF"/>
</svg>
```

---

## 5. Primary Logo (Horizontal)

```svg
<svg width="640" height="160" viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(0,16)">
    <path d="M64 0C32 0 8 28 8 56c0 32 56 80 56 80s56-48 56-80C120 28 96 0 64 0z" fill="#0B5FFF"/>
    <path d="M40 48h48v28H40z" rx="4" fill="#FFFFFF"/>
    <path d="M40 68h48v8H40z" fill="#FF8A1F"/>
  </g>
  <text x="160" y="96" font-size="64" font-weight="600" fill="#0B1220"
        font-family="Inter, system-ui, sans-serif">
    SkidSpace
  </text>
</svg>
```

---

## 6. CSS Tokens

```css
:root {
  --ss-blue:#0B5FFF;
  --ss-orange:#FF8A1F;
  --ss-text:#0B1220;
  --ss-muted:#475569;
  --ss-border:#E2E8F0;
  --ss-bg:#FFFFFF;
  --radius-sm:8px;
  --radius-md:14px;
  --radius-lg:20px;
}
```

---

## 7. File Structure

```txt
/public/brand/
├── logo-icon.svg
├── logo-primary.svg
├── map-pin.svg
├── map-pin-active.svg
└── README.md
```

---

## 8. Don’ts

- No gradients
- No shadows
- No recoloring
- No text inside pin

---

## 9. Agent Instruction

Use this document as the single source of truth for SkidSpace branding.
