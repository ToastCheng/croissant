# Croissant

A real-time video streaming application featuring a Node.js WebSocket stream server and a Next.js web interface.

## Project Structure

- `stream-server/`: Node.js server that streams video via WebSocket using MJPEG.
- `web/`: Next.js web application for viewing the live stream.

## Prerequisites

- Node.js (v18+ recommended)
- npm or yarn or pnpm
- ffmpeg (required for the stream server)

## Getting Started

### 1. Stream Server

The stream server reads a video file and broadcasts it over a WebSocket connection.

1. Navigate to the server directory:
   ```bash
   cd stream-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm run dev
   ```
   The server will start on `http://localhost:8080`.

   > **Note:** The server expects a video file named `maru.mp4` in the `stream-server` directory.

### 2. Web Interface

The web interface connects to the stream server to display the video feed.

1. Navigate to the web directory:
   ```bash
   cd web
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   The app will run on `http://localhost:3000`.

## Usage

1. Ensure both the stream server and web app are running.
2. Open your browser and go to [http://localhost:3000/stream](http://localhost:3000/stream).
3. Click the **START STREAM** button.

## Configuration

### Web App
You can configure the WebSocket URL by setting the `WS_URL` environment variable.
- Default: `ws://localhost:8080` (or inferred from the browser's hostname if not set).

To set it locally, create a `.env.local` file in the `web` directory:
```
WS_URL=wss://your-server-url
```
