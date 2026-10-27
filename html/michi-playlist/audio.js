// const jsmediatags = window.jsmediatags;
// const mp3tag = window.mp3tag;



var aud = {
  // (A) INITIALIZE PLAYER
  player: null, // HTML <AUDIO> ELEMENT
  playlist: null, // HTML PLAYLIST
  now: 0, // CURRENT SONG

  title_name: "",
  artist_name: "",
  album_name: "",
  year_name: "",
  album_cover: null,
  button_skip: null,
  button_back: null,
  button_play: null,
  current_song: null,
  max_songs: null,

  nav: null,

  init: () => {
    // (A1) GET HTML ELEMENTS
    aud.player = document.getElementById("demoAudio");
    // hack by stackoverflow, a silent audio is played in between so the media session does not stop
    // https://stackoverflow.com/questions/76354522/javascript-mediasession-stops-working-when-changing-the-src-attribute-of-htmla
    aud.player_silence = document.getElementById("demoAudio_silence");
    aud.player_silence.onended = aud.player_silence.play;
    aud.playlist = document.querySelectorAll("#demoList .song");

    aud.title_name = document.getElementById("title");
    aud.artist_name = document.getElementById("artist");
    aud.album_name = document.getElementById("album");
    aud.year_name = document.getElementById("year");
    aud.album_cover = document.getElementById("albumcover");

    aud.button_skip = document.getElementById("skip");
    aud.button_back = document.getElementById("back");
    aud.button_play = document.getElementById("play");

    aud.current_song = document.getElementById("current_song");
    aud.max_song = document.getElementById("maxsong");

    aud.myParagraph = document.getElementById('myParagraph');

    // selbst geschrieben
    aud.button_skip.onclick = () => { aud.change(1); };
    aud.button_back.onclick = () => { aud.change(-1); };
    aud.button_play.onclick = () => { aud.pause(); };

    // Gemini advice, only one init because it can loose connection after every
    // new song
    if ('mediaSession' in navigator) {
      // play
      navigator.mediaSession.setActionHandler('play', function() { 
        // aud.pause(); 
        aud.player.play();
        navigator.mediaSession.playbackState = 'playing';
      });
      // pause
      navigator.mediaSession.setActionHandler('pause', function() { 
        // aud.pause(); 
        aud.player.pause();
        navigator.mediaSession.playbackState = 'paused';
      });
      // previous
      navigator.mediaSession.setActionHandler('previoustrack', function() {
        aud.change(-1); 
      });
      // next
      navigator.mediaSession.setActionHandler('nexttrack', function() {
        aud.change(1);
      });
      // stop
      navigator.mediaSession.setActionHandler('stop', function() { 
        // Stoppt die Audio-Wiedergabe
        aud.player.pause();
        aud.player.src = ""; // Setzt die Quelle zurück
        // Setzt den Wiedergabestatus auf "gestoppt"
        navigator.mediaSession.playbackState = 'none';
        // Entfernt alle Media Session Controls
        // aud.removeMediaSessionHandlers();
      });

      // rest of the commands
      //navigator.mediaSession.setActionHandler('seekbackward', function() { /* Code excerpted. */ });
      //navigator.mediaSession.setActionHandler('seekforward', function() { /* Code excerpted. */ });
      //navigator.mediaSession.setActionHandler('seekto', function() { /* Code excerpted. */ });
      //navigator.mediaSession.setActionHandler('skipad', function() { /* Code excerpted. */ });
      //navigator.mediaSession.setActionHandler("hangup", () => { /* Code excerpted. */ });
    }


    aud.max_song.textContent = aud.playlist.length;

    // // (A2) LOOP THROUGH ALL THE SONGS, CLICK TO PLAY
    for (let i = 0; i < aud.playlist.length; i++) {
      aud.playlist[i].onclick = () => { aud.play(i); };
    }





    // (A3) AUTO PLAY WHEN SUFFICIENTLY LOADED
    // plays the song when a new source is loaded to audio tag
    // so no extra play command is needed
    // aud.player.oncanplay = aud.player.play;
    aud.player.oncanplay = () => {
    // aud.player.oncanplaythrough = () => {
      aud.player_silence.pause();
      aud.player.play();
      // navigator.mediaSession.playbackState = 'playing';
      // Initialer Status für die Media Session API
    };

    // (A4) AUTOPLAY NEXT SONG IN PLAYLIST WHEN CURRENT SONG ENDS
    aud.player.onended = () => {
      aud.now++;
      if (aud.now >= aud.playlist.length) { aud.now = 0; }
      aud.play(aud.now);
    };

    // (A5) AUTOPLAY FIRST SONG (OPTIONAL)
    aud.play(0);
  },


  // (B) PLAY SELECTED SONG
  play : (id) => {
    // (B1) UPDATE AUDIO SRC
    aud.now = id;
    aud.player_silence.play();
    aud.player.src = aud.playlist[id].dataset.src;
    aud.current_song.textContent = id + 1;

    // (B2) A LITTLE BIT OF COSMETIC
    for (let i=0; i<aud.playlist.length; i++) {
      aud.playlist[i].style.backgroundColor = i==id ? "yellow" : "";
    }


    // inputFile.addEventListener('change', function () {
    //   const reader = new FileReader()
    //   reader.onload = function () {
    //     const buffer = this.result
    //
    //     // MP3Tag Usage
    //     const mp3tag = new MP3Tag(buffer)
    //     mp3tag.read()
    //
    //     // Handle error if there's any
    //     if (mp3tag.error !== '') throw new Error(mp3tag.error)
    //     else console.log(mp3tag.tags)
    //   }
    //
    //   if (this.files.length > 0) {
    //     reader.readAsArrayBuffer(this.files[0])
    //   }
    // })

    // if ('mediaSession' in navigator) {
    //   // console.log('mediasession in navigator');
    //   navigator.mediaSession.metadata = new MediaMetadata({
    //     // title: "_empty_title_",
    //     // artist: "_empty_artist_",
    //     // album: "_empty_album_"
    //     title: id,
    //     artist: id,
    //     album: id
    //
    //     // title: tag.tags.title,
    //     // artist: tag.tags.artist,
    //     // album: tag.tags.album,
    //     // artwork: artwork
    //   });
    //   // 1 second delay
    //   setTimeout(function(){
    //     console.log("Executed after 1 second");
    //   }, 3000);
    //   aud.myParagraph.textContent += 'worked ' + id + ",";
    // } else {
    //   aud.myParagraph.textContent += 'media Session died when playing ' + id + "<br>";
    // }


    // SHOW META TAGS
    rel_path = document.location.pathname;
    if (rel_path.endsWith("index.php")) {
      rel_path = rel_path.split("/").slice(0, -1).join("/") + "/"
    }
    const file = document.location.origin + rel_path + aud.playlist[id].dataset.src;
    // 2. Lade die Datei mit der fetch-API, um die Rohdaten zu erhalten
    fetch(file)
      .then(response => {
        // Überprüfe, ob die Anfrage erfolgreich war
        if (!response.ok) {
          aud.myParagraph.textContent += 'MP3 file did not download.<br>';
          throw new Error('Network response was not ok');
        }
        // Konvertiere die Antwort in einen Blob
        return response.blob();
      })
      .then(blob => {

        // console.log("michi");
        // console.log(rel_path);
        // console.log(document.location);

        // aud.myParagraph.textContent += 'MP3 file downloaded,';

        jsmediatags.read(blob, {
          onSuccess: function(tag) {
            // console.log(tag);

            // aud.myParagraph.textContent += 'onSuccess,';
            const data = tag.tags.picture.data;
            const format = tag.tags.picture.format;
            let base64String = "";
            for (let i = 0; i < data.length; i++) 
              base64String += String.fromCharCode(data[i]);

            if (tag.version == "2.4.0") {
              aud.year_name.textContent = tag.tags.TDRC.data;
            } else {
              aud.year_name.textContent = tag.tags.year;
            }

            const data_url = `url(data:${format};base64,${window.btoa(base64String)})`;
            const only_data = `data:${format};base64,${window.btoa(base64String)}`;

            aud.album_cover.style.backgroundImage = data_url;
            aud.title_name.textContent = tag.tags.title;
            aud.artist_name.textContent = tag.tags.artist;
            aud.album_name.textContent = tag.tags.album;

            const artwork = [{
              //   src: base64Url,
              src: only_data,
              sizes: '512x512', // Adjust size if you know the actual dimensions
              type: format
            }];

            if ('mediaSession' in navigator) {
              // console.log('mediasession in navigator');
              navigator.mediaSession.metadata = new MediaMetadata({
                // title: "_empty_title_",
                // artist: "_empty_artist_",
                // album: "_empty_album_"

                title: tag.tags.title,
                artist: tag.tags.artist,
                album: tag.tags.album,
                artwork: artwork
              });
            }
            // aud.myParagraph.textContent += 'filled out tags,';

            // navigator.mediaSession.metadata.title = tag.tags.title;
            // navigator.mediaSession.metadata.artist = tag.tags.artist;
            // navigator.mediaSession.metadata.album = tag.tags.album;
            // navigator.mediaSession.metadata.artwork = artwork;

            // console.log(navigator);
          },
          onError: function(error) {
            console.log(error);
            console.log("it does not work");
          }
        });
      })
      .catch(error => {
        // Fange Netzwerkfehler ab
        console.log("Fetch error:", error);
      });


    // Initialer Status für die Media Session API
    navigator.mediaSession.playbackState = 'playing';
      // aud.myParagraph.textContent += 'end<br>';
  },


  change: (step) => {
    current = aud.now + step;
    if (current >= aud.playlist.length) {
      current = 0;
    }
    if (current < 0) {
      current = aud.playlist.length - 1;
    }
    aud.play(current);
  },


  pause : () => {
    if (aud.player.paused) {
      aud.player.play();
      // Aktualisiere den Media-Session-Zustand, wenn die Wiedergabe startet
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } else {
      aud.player.pause();
      // Aktualisiere den Media-Session-Zustand, wenn die Wiedergabe pausiert
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
  }
};


window.addEventListener("DOMContentLoaded", aud.init);
