# Enabling trickplay (scrubber thumbnails) on your Jellyfin server

Jellyflix reads trickplay tile-sheets the server generates; it shows a plain
scrubber where they're absent.

1. Jellyfin **Dashboard → Playback** (or a library's **Manage Library →
   Trickplay** settings): enable **"Enable trickplay image extraction"**.
   Optional: "Generate images during library scan", set interval (default 10s),
   tile size, and hardware acceleration if available.
2. **Dashboard → Scheduled Tasks → "Generate Trickplay Images" → Run**. Large
   libraries take a while and use CPU/GPU + disk for the tile JPEGs.
3. Reload a title in Jellyflix and hover the seek bar — thumbnails appear once
   `item.Trickplay` is populated for that media source.

Notes: HEVC/10-bit sources may need ffmpeg with matching decoders; storage grows
with library size and thumbnail resolution.
