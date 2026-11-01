# Deployment
Upload the contents of `dr3amy-static.zip` (the folder root contains `index.html`) to any static host.
- **Cloudflare Pages**: Create project, Direct Upload, drop the unzipped folder. Build command: none. Output directory: `/`. The `_headers` file adds a strict Content-Security-Policy.
- **GitHub Pages**: commit the files to a branch and enable Pages for it. `_headers` is ignored there (harmless).
- **Local**: `python3 -m http.server` in the folder. ES modules do not load from `file://`, so use a server.
HTTPS (or localhost) is required for Notifications, Web Share and persistent storage.
