import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

// GitHub Pages serves the site from https://artew4.github.io/Gridfall/, so a production build (and
// `vite preview`, which serves that build: its command is 'serve') is based at /Gridfall/; the dev
// server stays at /. Everything fetched at runtime must be built from import.meta.env.BASE_URL (the
// music folder is: MusicManager), never from a root-absolute '/path'.
// BASE_PATH overrides it (e.g. BASE_PATH=/ for a build served from a domain root).

/** The files in public/audio/music at build time: a production build looks no further (no 404s). */
function musicFiles() {
  try {
    return readdirSync('public/audio/music').filter((f) => !f.startsWith('.') && f !== 'README.md');
  } catch {
    return [];
  }
}

export default defineConfig(({ command, isPreview }) => ({
  base: process.env.BASE_PATH ?? (command === 'build' || isPreview ? '/Gridfall/' : '/'),
  define: { __MUSIC_FILES__: JSON.stringify(command === 'build' ? musicFiles() : null) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  server: { open: false },
}));
