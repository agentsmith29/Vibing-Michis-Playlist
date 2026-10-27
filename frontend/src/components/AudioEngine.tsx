import { useEffect, useRef } from "react";

import { api } from "../api/client";
import type { Track } from "../api/types";
import { artworkUrl } from "../lib/format";
import { audio, useCurrentTrack, usePlayer, useProgress } from "../store/player";
import { toast } from "../store/ui";

/** Loads a cover as data URL: lock screens fetch artwork without the session cookie. */
async function artworkDataUrl(track: Track): Promise<string | null> {
  const url = artworkUrl(track.artwork, "thumb");
  if (!url) return null;
  try {
    const blob = await (await fetch(url, { credentials: "same-origin" })).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Connects the global <audio> element with the player store, the media session and play history. */
export default function AudioEngine() {
  const track = useCurrentTrack();
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const loggedFor = useRef<string | null>(null);

  // Audio element events -> stores.
  useEffect(() => {
    const progress = useProgress.setState;
    let lastSaved = 0;
    const onTime = () => {
      progress({ currentTime: audio.currentTime });
      if (Math.abs(audio.currentTime - lastSaved) > 5) {
        lastSaved = audio.currentTime;
        usePlayer.setState({ resumeAt: audio.currentTime });
      }
      if ("mediaSession" in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            position: Math.min(audio.currentTime, audio.duration),
            playbackRate: audio.playbackRate,
          });
        } catch {
          /* some browsers reject position updates while loading */
        }
      }
    };
    const onDuration = () => progress({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    const onPlay = () => usePlayer.setState({ isPlaying: true });
    const onPause = () => usePlayer.setState({ isPlaying: false });
    const onWaiting = () => progress({ buffering: true });
    const onPlaying = () => {
      progress({ buffering: false });
      // Record a play once per loaded song.
      const { queue, index, context } = usePlayer.getState();
      const item = queue[index];
      if (item && loggedFor.current !== `${item.key}:${audio.src}`) {
        loggedFor.current = `${item.key}:${audio.src}`;
        api("/history/", {
          body: { track_id: item.track.id, playlist_id: context?.type === "playlist" ? context.id : null },
        }).catch(() => {});
      }
    };
    const onEnded = () => {
      loggedFor.current = null;
      usePlayer.getState().next(true);
    };
    const onError = () => {
      if (!audio.getAttribute("src")) return;
      progress({ buffering: false });
      toast("This song could not be played", "danger");
      usePlayer.setState({ isPlaying: false });
    };

    const events: [string, () => void][] = [
      ["timeupdate", onTime],
      ["durationchange", onDuration],
      ["loadedmetadata", onDuration],
      ["play", onPlay],
      ["pause", onPause],
      ["waiting", onWaiting],
      ["playing", onPlaying],
      ["ended", onEnded],
      ["error", onError],
    ];
    events.forEach(([name, handler]) => audio.addEventListener(name, handler));
    return () => events.forEach(([name, handler]) => audio.removeEventListener(name, handler));
  }, []);

  useEffect(() => {
    audio.volume = volume * volume; // perceptually smoother curve
    audio.muted = muted;
  }, [volume, muted]);

  // Reset the progress bar whenever the song changes.
  useEffect(() => {
    useProgress.setState({ currentTime: usePlayer.getState().resumeAt, duration: track?.duration ?? 0 });
  }, [track?.id, track?.duration]);

  // Lock screen / headset controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const player = usePlayer.getState;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => player().togglePlay()],
      ["pause", () => audio.pause()],
      ["previoustrack", () => player().previous()],
      ["nexttrack", () => player().next()],
      ["seekto", (details) => details.seekTime !== undefined && player().seek(details.seekTime)],
      ["seekbackward", (details) => player().seek(audio.currentTime - (details.seekOffset ?? 10))],
      ["seekforward", (details) => player().seek(audio.currentTime + (details.seekOffset ?? 10))],
      ["stop", () => audio.pause()],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* action not supported */
      }
    }
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      document.title = "Michi Playlist";
      return;
    }
    document.title = `${track.title} · ${track.artist}`;
    const base = { title: track.title, artist: track.artist, album: track.album ?? "" };
    navigator.mediaSession.metadata = new MediaMetadata(base);
    let cancelled = false;
    artworkDataUrl(track).then((src) => {
      if (!cancelled && src) {
        navigator.mediaSession.metadata = new MediaMetadata({
          ...base,
          artwork: [{ src, sizes: "300x300", type: "image/jpeg" }],
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [track]);

  const isPlaying = usePlayer((s) => s.isPlaying);
  useEffect(() => {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  return null;
}
