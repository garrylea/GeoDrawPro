
# GeoDraw Pro

GeoDraw Pro is a cross-platform (Windows, macOS, Linux, and Web) geometric drawing tool. It features a built-in Math Solver powered by Google Gemini AI.

## 🏗 Architecture

The application uses a **Client-Server** architecture to ensure security and cross-platform compatibility.

*   **Client (Frontend)**: 
    *   Built with React, Vite, and Electron.
    *   Runs on the user's device (as a desktop app) or in a browser.
    *   Does **not** store API Keys.
*   **Server (Backend)**:
    *   Built with Node.js and Express.
    *   Stores the `GEMINI_API_KEY`.
    *   Proxies requests from the Client to Google's Gemini API.

---

## 🚀 Getting Started

### 1. Prerequisites
*   [Node.js](https://nodejs.org/) (v18 or higher recommended).
*   A Google Gemini API Key (Get one from [Google AI Studio](https://aistudio.google.com/)).

### 2. Installation

Clone the repository and install dependencies:

```bash
npm install
```

### 3. Configuration (Server)

You must configure the server to talk to Google Gemini.

1.  Create a `.env` file in the **root** directory (or inside `server/` if you strictly prefer, but the script loads from root by default).
2.  Add your API Key:

```env
GEMINI_API_KEY=your_actual_api_key_here
PORT=3000
```

> **Security Note:** Never commit `.env` to version control (Git).

### 4. Running Locally (Development)

To run both the **Frontend** and **Backend** simultaneously:

```bash
npm run dev:all
```

*   **Frontend**: http://localhost:5173
*   **Backend**: http://localhost:3000

---

## 💻 Building for Desktop (Electron)

To create a standalone application for your OS (Mac, Windows, Linux):

1.  **Start the Backend**: You must have the server running (either locally or deployed to the cloud).
2.  **Configure API URL**: If your server is deployed, create a `.env` file for the **Client** build:
    ```env
    VITE_API_URL=https://your-deployed-server.com
    ```
    *(If running locally, it defaults to http://localhost:3000)*.

3.  **Build the App**:
    ```bash
    npm run electron:build
    ```
    The executable will be in the `release/` folder.

---

## 🌐 Deploying the Web Version

### Client (Frontend) Deployment
1.  Run `npm run build`.
2.  Upload the contents of the `dist/` folder to any static host (Netlify, Vercel, GitHub Pages).

### Server (Backend) Deployment
Since the AI feature requires a backend, you must deploy the `server/` code to a Node.js hosting provider (Render, Railway, Heroku, Vercel Serverless, etc.).

1.  Deploy the project.
2.  Set the Environment Variable `GEMINI_API_KEY` in your hosting dashboard.
3.  Update your Client's `.env` (or build settings) to point `VITE_API_URL` to your new server address.

---

## ⌨️ Shortcuts

*   **Ctrl/Cmd + Alt + Shift + M**: Open the Math Solver (Hidden Feature).
*   **Ctrl/Cmd + Alt + C**: Snippet Tool (Desktop App only).
*   **Ctrl/Cmd + Z**: Undo.
*   **Delete/Backspace**: Delete selected shape.

