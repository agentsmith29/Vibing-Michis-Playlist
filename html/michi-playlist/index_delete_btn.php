<!DOCTYPE html>
<html>
  <head>
    <title> Michi-Playlist </title>
    <link rel="stylesheet" href="./style.css">
    <link rel="icon" href="./mango_icon.png">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="jsmediatags.js"></script>
    <script src="audio.js"></script>
    <style>
        /* Grund-Design & Schrift */
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            margin: 0;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #333;
        }

        .todos {
            max-width: 1000px;
            width: 95%;
            margin: 20px auto;
            display: flex;
            flex-wrap: wrap;
            gap: 30px;
            justify-content: center;
            background: rgba(255, 255, 255, 0.4);
            backdrop-filter: blur(10px);
            padding: 30px;
            border-radius: 30px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.1);
        }

        /* Links & Header */
        h1 { color: #2c3e50; font-weight: 300; margin-top: 0; }
        a { text-decoration: none; color: #555; transition: 0.3s; }
        a:hover { color: #000; }

        /* Album Cover & Player Bereich */
        .main { flex: 1; min-width: 320px; text-align: center; }

        #albumcover {
            width: 300px;
            height: 300px;
            margin: 0 auto 20px;
            border-radius: 20px;
            box-shadow: 0 10px 20px rgba(0,0,0,0.2);
            background-color: #eee;
            background-position: center;
            background-size: cover;
            transition: transform 0.5s ease;
        }
        
        #albumcover:hover { transform: scale(1.02); }

        /* Player Card */
        .player {
            background: white;
            border-radius: 20px;
            padding: 25px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.05);
        }

        #title { font-weight: bold; font-size: 1.4rem; display: block; margin-bottom: 5px; }
        #artist { color: #777; font-size: 1.1rem; }

        /* Buttons & Controls */
        button.controls {
            background: #7DE5CC;
            border: none;
            border-radius: 50%;
            height: 55px;
            width: 55px;
            margin: 10px;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }

        button.controls:hover {
            transform: translateY(-3px);
            background: #69d1b8;
            box-shadow: 0 6px 12px rgba(0,0,0,0.15);
        }

        button.controls:active { transform: translateY(0); }
        img.controls { height: 18px; }

        /* Audio Tag Styling */
        audio {
            width: 100%;
            margin: 15px 0;
            height: 35px;
        }

        /* Playlist Bereich */
        .rightside { flex: 1; min-width: 320px; }
        
        .playlist_buttons { margin-bottom: 20px; }
        
        select, input[type="submit"] {
            padding: 10px;
            border-radius: 10px;
            border: 1px solid #ddd;
            outline: none;
        }

        .rolling {
            background: white;
            border-radius: 20px;
            height: 800px;
            overflow-y: auto;
            box-shadow: inset 0 2px 10px rgba(0,0,0,0.05);
        }

        /* Song Liste */
        #demoList .song {
            padding: 15px 20px;
            border-bottom: 1px solid #f0f0f0;
            transition: 0.2s;
            cursor: pointer;
            font-size: 0.95rem;
        }

        #demoList .song:hover {
            background-color: #f8fdfc;
            padding-left: 25px;
            color: #7DE5CC;
        }

        /* Aktiver Song in der Liste (musst du ggf. in deinem JS ansteuern) */
        #demoList .song[style*="yellow"], .active-song {
            background-color: #7DE5CC !important;
            color: white !important;
            font-weight: bold;
        }

        /* Scrollbar Design */
        .rolling::-webkit-scrollbar { width: 6px; }
        .rolling::-webkit-scrollbar-track { background: transparent; }
        .rolling::-webkit-scrollbar-thumb { background: #ccc; border-radius: 10px; }
        .rolling::-webkit-scrollbar-thumb:hover { background: #bbb; }

        /* Info Texte */
        .info { font-size: 0.9rem; color: #888; margin-top: 15px; border-top: 1px solid #eee; padding-top: 15px; }
        .fromto { font-size: 0.8rem; color: #aaa; margin-bottom: 15px; }


        .song {
            display: flex;
            justify-content: space-between; /* Schiebt Text nach links, X nach rechts */
            align-items: center;
            padding: 10px;
            border-bottom: 1px solid #ccc;
            cursor: pointer;
        }

        .delete-btn {
            color: #ff4d4d;
            font-weight: bold;
            font-size: 30px;
            padding: 5px 10px;
            cursor: pointer;
            transition: transform 0.2s;
        }

        .delete-btn:hover {
            transform: scale(1.2);
            color: #ff0000;
        }

    </style>
  </head>
  <body>
<script>
function deleteSong(event, element) {
    // Verhindert, dass der Klick das Abspielen auslöst
    event.stopPropagation();

    // Den gesamten .song Container löschen
    const songContainer = element.closest('.song');
    if (songContainer) {
        songContainer.remove();
        console.log("Song entfernt");
    }
}
</script>

<div class="todos">

<div class="main">
<center>
<a href="/index.html"> Home </a>
<h1> Michi Playlist </h1>
<p id="myParagraph"> </p>



<div id="albumcover"></div>

<div class="player">

<div class="fromto">
Playing <span id="current_song">1</span> of <span id="maxsong">600</span>
<span style="float:right;"> <a href="info.html" target="_blank"> <img src="info.png" width="25px"> </a> </span>
<br>
<br>
</div>

<div class="controls">

    <span id="title">Title</span>
    <br>
    <br>

    <!-- (A) AUDIO TAG -->
    <audio id="demoAudio" controls></audio>
    <audio id="demoAudio_silence" src="clock_ticking_sound.mp3"></audio>


    <br>
       <button id="back" class="controls"> <img class="controls" src="back.svg"> </button>
    <button id="play" class="controls"> <img class="controls" src="play2.svg" id="play_icon"> </button>
    <button id="skip" class="controls"> <img class="controls" src="skip.svg"> </button>

    <br>
    <br>
    <div class="info">

    <span id="artist">Artist</span>
    <br>
    <br>
    <span id="album">Album</span>
    <br>
    <span id="year">Year</span>

    </div>

</div>

</div>



</center>
</div>

<div class="rightside">
<div class="playlist_buttons">

<form action="index.php" method="get">

    <select name="playlists_michi" id="playlists_michi" style="width:300px">

<?php
echo '<option value="nothing">Playlists</option>';
if (!empty($_GET["playlists_michi"])) {
    $current = $_GET["playlists_michi"];
    // echo '<option value="'. $current . '">Current: '.$current.'</option>';
    $file = $_GET['playlists_michi'];
} else {
    $file = "playlist.txt";

    // echo '<option value="playlist.txt">Current: All</option>';
}
echo '<option value="nothing">------------------------</option>';
echo '<option value="playlist.txt">Alle Songs</option>';
echo '<option value="nothing">------------------------</option>';


$playlist_files = scandir("playlists/");
// str_ends_with only works in PHP 8
function endsWith(string $haystack, string $needle): bool
{
    $length = strlen($needle);
    if ($length === 0) {
        return true;
    }
    return substr($haystack, -$length) === $needle;
}
foreach ($playlist_files as $f) {
    if (endsWith($f,'.txt')) {
        if ($f == "playlist.txt"){
            continue;
        }
        echo '<option value="'.$f.'">'.$f.'</option>';
    }
}
?>

    </select>
    <input type="submit" value="Play"/>
</form>

</div>

<div class="rolling">


    <!-- (B) PLAYLIST -->
    <div id="demoList"><?php
// (B1) GET ALL SONGS
if ($file == "nothing") {
    $file = "playlist.txt";
}
// $lines = file("playlist.txt");
$lines = file("playlists/$file");
shuffle($lines);

foreach ($lines as $line) {
    // Zerlegt den String beim Semikolon
    // $parts[0] = Pfad, $parts[1] = Titel, $parts[2] = Interpret
    $parts = explode(";", $line);
    
    // Variablen zur besseren Lesbarkeit
    $path = $parts[0];
    $title = $parts[1];
    $artist = $parts[2];

    echo '<div data-src="'. $path . '" class="song">';
    echo "<div>";
    echo '<strong>' . $title . '</strong><br>';
    echo '<small>' . $artist . '</small>';
    echo '</div>';
    echo '<span class="delete-btn" onclick="deleteSong(event, this)">×</span>';
    echo '</div>';
}

?>

</div>
</div>
</div>

</div>

</body>
</html>
