# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🏗 Architecture

GeoDraw Pro follows a client-server architecture to facilitate cross-platform usage and secure API key management.

- **Frontend (Client)**: A React application built with Vite and TypeScript. It is wrapped in Electron for desktop support.
    - Core UI components are located in `./components`.
    - Rendering logic and geometry management use custom layers and solvers.
    - Uses KaTeX for mathematical formula rendering.
- **Backend (Server)**: A Node.js/Express server that acts as a proxy to the Google Gemini API.
    - It manages the `GEMINI_API_KEY` securely.
    - Located in the `./server` directory.
- **Desktop Integration**: Uses Electron to package the application for Windows, macOS, and Linux.

## 🛠 Development Commands

### Core Commands

- `npm run dev:all`: Runs both the frontend (Vite) and backend (Express) simultaneously for development.
- `npm run dev`: Starts the Vite development server (Frontend only).
- `npm run server`: Starts the Express server (Backend only).
- `npm test`: Runs the test suite using Vitest.

### Building and Packaging

- `npm run build`: Builds the frontend production assets using Vite and TypeScript.
- `npm run electron:build`: Builds the full Electron application for distribution (outputs to `release/`).

### Desktop Development

- `npm run electron:dev`: Launches the application in Electron mode, automatically starting the Vite dev server and waiting for it to be ready.

## ⚙️ Configuration

### Environment Variables

The application uses `.env` files for configuration.

- **Server**: Requires `API_KEY` (Gemini API Key) and optionally `PORT`.
- **Client**: Requires `VITE_API_URL` to point to the backend server (defaults to `http://localhost:3000` for local development).

### Project Files

- `.geo` files: Custom project file format for GeoDraw Pro.
- `.json` files: Standard JSON files.
