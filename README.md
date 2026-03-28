# Mermaid Visual Editor Pro

> A powerful, bidirectional visual editor for Mermaid flowchart diagrams.

Write Mermaid code and instantly see it rendered as an interactive, draggable board — or edit the diagram visually and watch the code update in real-time.

---

## Features

| Feature                         | Description                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------- |
| **Bidirectional Sync**          | Edit code to update the visual board, or edit the board to update the code   |
| **Nested Subgraphs**            | Full support for complex, nested grouping structures                         |
| **Auto Layout**                 | Dagre integration with a smart proxy-leaf algorithm for complex hierarchies  |
| **Figma-Compatible SVG Export** | Pure SVG export with fully editable layers, shapes, and texts                |
| **Standard Exports**            | Download as PNG image or PDF document                                        |
| **Customization**               | Change node text, shape, background color, text color, and border properties |

---

## Installation

The project is built with **React**, **Vite**, and **Tailwind CSS**.

### Prerequisites

- Node.js **v18 or above**

---

### Step 1 — Create the Project

```bash
# Create a new React project with Vite
npm create vite@latest mermaid-editor -- --template react

# Navigate into the directory
cd mermaid-editor
```

### Step 2 — Install Dependencies

```bash
# Install base packages
npm install

# Install Lucide React for UI icons
npm install lucide-react

# Install Tailwind CSS v3 (required for compatibility)
npm install -D tailwindcss@3 postcss autoprefixer

# Initialize Tailwind configuration
npx tailwindcss init -p
```

### Step 3 — Configure Tailwind CSS

Replace the contents of `tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

Then replace the contents of `src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}
```

### Step 4 — Inject Application Code

Copy the contents of `App.jsx` from this project and paste it into `src/App.jsx`, replacing the default content.

### Step 5 — Run the App

```bash
npm run dev
```

The app will be available at **http://localhost:5173**.

---

## 📄 License

This project is licensed under the **GPL-3.0 License**. See the [LICENSE](./LICENSE) file for full terms.
