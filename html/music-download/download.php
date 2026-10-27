<?php
$message = "";
$song_data = null;

// ==========================================
// AKTION 1: Song speichern (Add Song)
// ==========================================
if (isset($_POST["add"])) {

    $payload = [
        'temp_audio_path' => $_POST['temp_file'] ?? '',
        'image_path'      => $_POST['image_path'] ?? '',
        'title'           => $_POST['title'] ?? '',
        'artist'          => $_POST['artist'] ?? '',
        'album'           => $_POST['album'] ?? '',
        'genre'           => $_POST['genre'] ?? '',
        'year'            => $_POST['year'] ?? ''
    ];

    $jsonPayload = json_encode($payload);

    // Python-Script 2 ausführen
    $cmd = "python3 /app/mp3_library/save_metadata.py " . escapeshellarg($jsonPayload);
    $output = shell_exec($cmd);
    $result = json_decode($output, true);

    // Playlist generieren
    $command = escapeshellcmd('python3 /app/mp3_library/metatags_playlist.py'); 
    $playlist_output = shell_exec($command);

    $is_success = ($result && isset($result['status']) && $result['status'] === 'success');
    $status_msg = $is_success 
        ? "Song erfolgreich gespeichert!" 
        : "Fehler beim Speichern: " . ($result['error'] ?? 'Unbekannter Fehler');

    header("refresh:2;url=index.php");
    ?>
    <!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <title>Status - Michi Playlist</title>
        <link rel="icon" href="/mango_icon.png">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            :root {
                --bg-color: #0f172a;
                --card-bg: #1e293b;
                --text-main: #f8fafc;
                --text-muted: #94a3b8;
                --border-color: #334155;
            }
            body {
                margin: 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: var(--bg-color);
                color: var(--text-main);
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
            }
            .status-card {
                background: var(--card-bg);
                border: 1px solid var(--border-color);
                padding: 40px;
                border-radius: 16px;
                text-align: center;
                max-width: 450px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
            }
            .status-icon { font-size: 48px; margin-bottom: 15px; }
            p { color: var(--text-muted); font-size: 14px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="status-card">
            <div class="status-icon"><?php echo $is_success ? '✅' : '❌'; ?></div>
            <h2><?php echo htmlspecialchars($status_msg); ?></h2>
            <p>Du wirst in Kürze zur Startseite weitergeleitet...</p>
        </div>
    </body>
    </html>
    <?php
    exit();
}

// ==========================================
// AKTION 2: Song verwerfen (Delete)
// ==========================================
if (isset($_POST["delete"])) {

    if (!empty($_POST["temp_file"]) && file_exists($_POST["temp_file"])) {
        unlink($_POST["temp_file"]);
    }
    if (!empty($_POST["image_path"]) && file_exists($_POST["image_path"])) {
        unlink($_POST["image_path"]);
    }

    header("refresh:2;url=index.php");
    ?>
    <!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <title>Verworfen - Michi Playlist</title>
        <link rel="icon" href="/mango_icon.png">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            :root {
                --bg-color: #0f172a;
                --card-bg: #1e293b;
                --text-main: #f8fafc;
                --text-muted: #94a3b8;
                --border-color: #334155;
            }
            body {
                margin: 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: var(--bg-color);
                color: var(--text-main);
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
            }
            .status-card {
                background: var(--card-bg);
                border: 1px solid var(--border-color);
                padding: 40px;
                border-radius: 16px;
                text-align: center;
                max-width: 450px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
            }
            .status-icon { font-size: 48px; margin-bottom: 15px; }
            p { color: var(--text-muted); font-size: 14px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="status-card">
            <div class="status-icon">🗑️</div>
            <h2>Download verworfen</h2>
            <p>Temporäre Dateien wurden gelöscht. Leite weiter...</p>
        </div>
    </body>
    </html>
    <?php
    exit();
}

// ==========================================
// INITIAL: URL wurde übergeben -> Download & Fetch
// ==========================================
if (empty($_POST["song_url"])) {
    header("refresh:3;url=index.php");
    ?>
    <!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <title>Keine URL - Michi Playlist</title>
        <link rel="icon" href="/mango_icon.png">
        <style>
            body { background: #0f172a; color: #f8fafc; font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
            .card { background: #1e293b; border: 1px solid #334155; padding: 30px; border-radius: 12px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>Keine gültige URL übergeben.</h2>
            <p style="color: #94a3b8;">Kehre zur Startseite zurück...</p>
        </div>
    </body>
    </html>
    <?php
    die();
}

$url = $_POST["song_url"];
$advanced_search = !empty($_POST["advanced_search"]) ? ' ' . escapeshellarg($_POST["advanced_search"]) : '';

// fetch_song.py / download_mp3_and_metadata.py aufrufen
$command = "python3 /app/mp3_library/download_mp3_and_metadata.py " . escapeshellarg($url) . $advanced_search;
$json_output = shell_exec($command);

// JSON-Antwort von Python parsen
$download_data = json_decode($json_output, true);
$song_data = $download_data['tags'] ?? null;
$alternatives = $download_data['alternatives'] ?? [];

if (isset($download_data['error'])) {
    $message = "Fehler beim Verarbeiten: " . $download_data['error'];
}
?>

<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>Michi-Playlist - Review Song</title>
    <link rel="icon" href="/mango_icon.png">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --accent-color: #22c55e;
            --accent-hover: #16a34a;
            --danger-color: #ef4444;
            --danger-hover: #dc2626;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --input-bg: #0f172a;
            --border-color: #334155;
        }

        body {
            margin: 0;
            padding: 40px 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            box-sizing: border-box;
        }

        .top-nav {
            position: absolute;
            top: 20px;
            left: 20px;
        }

        .top-nav a {
            color: var(--text-muted);
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            transition: color 0.2s;
        }

        .top-nav a:hover {
            color: var(--accent-color);
        }

        .container {
            width: 100%;
            max-width: 820px;
        }

        .card {
            background-color: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 35px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        }

        .header-title {
            margin-top: 0;
            margin-bottom: 5px;
            font-size: 22px;
            font-weight: 700;
        }

        .source-url {
            font-size: 13px;
            color: var(--text-muted);
            margin-bottom: 20px;
            word-break: break-all;
        }

        .source-url a {
            color: var(--accent-color);
            text-decoration: none;
        }

        .source-url a:hover {
            text-decoration: underline;
        }

        .container-flex {
            display: flex;
            gap: 30px;
            align-items: flex-start;
        }

        .cover-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
        }

        img#cover-preview {
            width: 240px;
            height: 240px;
            object-fit: cover;
            border-radius: 12px;
            border: 1px solid var(--border-color);
            background-color: var(--input-bg);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .text-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 14px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .form-group label {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .form-group input, .form-group select {
            padding: 10px 14px;
            font-size: 14px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            background-color: var(--input-bg);
            color: var(--text-main);
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
            box-sizing: border-box;
            width: 100%;
        }

        .form-group select {
            cursor: pointer;
            accent-color: var(--accent-color);
        }

        .form-group input:focus, .form-group select:focus {
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
        }

        .button-group {
            margin-top: 10px;
            display: flex;
            gap: 12px;
        }

        .btn {
            flex: 1;
            padding: 12px;
            font-size: 15px;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.2s, transform 0.1s;
            text-align: center;
        }

        .btn-add {
            background-color: var(--accent-color);
            color: #ffffff;
        }

        .btn-add:hover {
            background-color: var(--accent-hover);
        }

        .btn-delete {
            background-color: var(--danger-color);
            color: #ffffff;
        }

        .btn-delete:hover {
            background-color: var(--danger-hover);
        }

        .btn:active {
            transform: scale(0.98);
        }

        .error-card {
            background-color: rgba(239, 68, 68, 0.1);
            border: 1px solid var(--danger-color);
            color: #fca5a5;
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        @media (max-width: 680px) {
            .container-flex {
                flex-direction: column;
                align-items: center;
            }
            img#cover-preview {
                width: 200px;
                height: 200px;
            }
            .card {
                padding: 25px 20px;
            }
        }
    </style>
</head>
<body>

    <div class="top-nav">
        <a href="index.php">&larr; Abbrechen & Zurück</a>
    </div>

    <div class="container">
        <div class="card">
            
            <h1 class="header-title">Song überprüfen & anpassen</h1>
            <div class="source-url">
                Quelle: <a target="_blank" href="<?php echo htmlspecialchars($url); ?>"><?php echo htmlspecialchars($url); ?></a>
            </div>

            <?php if ($message): ?>
                <div class="error-card">
                    <strong>Fehler:</strong> <?php echo htmlspecialchars($message); ?>
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <a href="index.php" class="btn btn-add" style="display: inline-block; text-decoration: none; width: auto; padding: 10px 20px;">Zurück zur Startseite</a>
                </div>
            <?php elseif ($song_data): ?>

                <form action="" method="post">
                    
                    <!-- Versteckter Pfad der temporären Audiodatei -->
                    <input type="hidden" name="temp_file" value="<?php echo htmlspecialchars($download_data['temp_audio_path'] ?? ''); ?>">

                    <!-- WÄHLER FÜR ERGEBNIS-VORSCHLÄGE -->
                    <?php if (!empty($alternatives) && count($alternatives) > 1): ?>
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label for="suggestion_select" style="color: var(--accent-color);">🔍 Passenden iTunes-Treffer auswählen (<?php echo count($alternatives); ?> gefunden):</label>
                            <select id="suggestion_select" onchange="selectSuggestion(this.value)">
                                <?php foreach ($alternatives as $idx => $alt): ?>
                                    <option value="<?php echo $idx; ?>">
                                        <?php echo ($idx + 1) . ". " . htmlspecialchars($alt['artist']) . " - " . htmlspecialchars($alt['title']) . " (" . htmlspecialchars($alt['album']) . ")"; ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    <?php endif; ?>

                    <div class="container-flex">
                        
                        <!-- Linke Spalte: Live Cover-Vorschau -->
                        <div class="cover-box">
                            <img id="cover-preview" 
                                 src="<?php echo htmlspecialchars(!empty($download_data['image_path']) ? $download_data['image_path'] : '/mango_icon.png'); ?>" 
                                 alt="Album Cover">
                        </div>

                        <!-- Rechte Spalte: Formular-Eingaben -->
                        <div class="text-content">
                            
                            <div class="form-group">
                                <label for="image_path">Cover Image (Pfad oder Web-URL)</label>
                                <input type="text" id="image_path" name="image_path" 
                                       value="<?php echo htmlspecialchars($download_data['image_path'] ?? ''); ?>" 
                                       placeholder="https://example.com/cover.jpg"
                                       oninput="updatePreview(this.value)">
                            </div>

                            <div class="form-group">
                                <label for="title">Title</label>
                                <input type="text" id="title" name="title" value="<?php echo htmlspecialchars($song_data['title'] ?? ''); ?>" required>
                            </div>

                            <div class="form-group">
                                <label for="artist">Artist</label>
                                <input type="text" id="artist" name="artist" value="<?php echo htmlspecialchars($song_data['artist'] ?? ''); ?>" required>
                            </div>

                            <div class="form-group">
                                <label for="album">Album</label>
                                <input type="text" id="album" name="album" value="<?php echo htmlspecialchars($song_data['album'] ?? ''); ?>">
                            </div>

                            <div class="form-group">
                                <label for="genre">Genre</label>
                                <input type="text" id="genre" name="genre" value="<?php echo htmlspecialchars($song_data['genre'] ?? ''); ?>">
                            </div>

                            <div class="form-group">
                                <label for="year">Year</label>
                                <input type="number" id="year" name="year" value="<?php echo htmlspecialchars($song_data['year'] ?? ''); ?>">
                            </div>

                            <div class="button-group">
                                <button type="submit" name="add" id="add" class="btn btn-add">Add Song</button>
                                <button type="submit" name="delete" id="delete" class="btn btn-delete">Delete</button>
                            </div>

                        </div>
                    </div>
                </form>

                <script>
                    // Speichere die Alternativen als JSON in JavaScript
                    const suggestions = <?php echo json_encode($alternatives ?? []); ?>;

                    function selectSuggestion(index) {
                        const item = suggestions[index];
                        if (!item) return;

                        // Formularfelder dynamisch befüllen
                        document.getElementById('title').value = item.title || '';
                        document.getElementById('artist').value = item.artist || '';
                        document.getElementById('album').value = item.album || '';
                        document.getElementById('genre').value = item.genre || '';
                        document.getElementById('year').value = item.year || '';
                        document.getElementById('image_path').value = item.image_path || '';

                        // Cover Vorschau aktualisieren
                        updatePreview(item.image_path);
                    }

                    function updatePreview(url) {
                        const img = document.getElementById('cover-preview');
                        if (url && url.trim() !== '') {
                            img.src = url;
                        } else {
                            img.src = '/mango_icon.png';
                        }
                    }
                </script>

            <?php endif; ?>

        </div>
    </div>

</body>
</html>
