var tracks = ["audio/junge.mp3", "audio/Kids.mp3"];
var trackId = 0;

var audio = document.getElementById("michiaudio");
audio.src = tracks[trackId];

function updatePlayingMedia() {
  audio.src = tracks[trackId];
  // Update metadata (omitted)
}

navigator.mediaSession.setActionHandler("previoustrack", function() {
  trackId = (trackId + tracks.length - 1) % tracks.length;
  updatePlayingMedia();
});

navigator.mediaSession.setActionHandler("nexttrack", function() {
  trackId = (trackId + 1) % tracks.length;
  updatePlayingMedia();
});

navigator.mediaSession.setActionHandler("seekto", function(details) {
  audio.currentTime = details.seekTime;
});
