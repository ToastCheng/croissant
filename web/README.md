# Croissant Web Client

This is the Next.js web interface for the Croissant streaming application. It connects to the stream server to verify and display the video feed.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Features

- **Dashboard**: A landing page at `/`.
- **Stream Viewer**: A live MJPEG stream viewer at `/stream`.

## Configuration

The application connects to the stream server. By default, it looks for `ws://localhost:8080`.

You can override this by setting the `WS_URL` environment variable or creating a `.env` file:

```bash
WS_URL=wss://your-production-server.com
```

## For Full Project Details

Please refer to the [root README](../README.md) for instructions on how to run the entire system, including the stream server.
