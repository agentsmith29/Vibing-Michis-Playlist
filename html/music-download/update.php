<?php
// Live Output Streaming aktivieren (Server-Buffering ausschalten)
if (function_exists('apache_setenv')) {
    @apache_setenv('no-gzip', 1);
}
@ini_set('zlib.output_compression', 0);
@ini_set('implicit_flush', 1);
ob_implicit_flush(true);
while (ob_get_level() > 0) {
    ob_end_flush();
}
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>yt-dlp Update - Michi Playlist</title>
    <link rel="icon" href="/mango_icon.png">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --accent-color: #22c55e;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --border-color: #334155;
            --term-bg: #020617;
        }

        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            box-sizing: border-box;
        }

        .container {
            width: 100%;
            max-width: 750px;
        }

        .card {
            background-color: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 30px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        }

        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
        }

        h1 {
            font-size: 20px;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .terminal-window {
            background-color: var(--term-bg);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 15px;
            font-family: "Courier New", Courier, monospace;
            font-size: 13px;
            color: #38bdf8;
            height: 320px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
            box-shadow: inset 0 2px 6px rgba(0,0,0,0.8);
        }

        .terminal-line {
            line-height: 1.5;
        }

        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            background: #334155;
            color: var(--text-muted);
        }

        .status-badge.working {
            background: rgba(59, 130, 246, 0.2);
            color: #60a5fa;
            border: 1px solid #3b82f6;
        }

        .status-badge.success {
            background: rgba(34, 197, 94, 0.2);
            color: #4ade80;
            border: 1px solid #22c55e;
        }

        .status-badge.error {
            background: rgba(239, 68, 68, 0.2);
            color: #f87171;
            border: 1px solid #ef4444;
        }

        .footer-action {
            margin-top: 20px;
            display: flex;
            justify-content: flex-end;
        }

        .btn-back {
            background-color: var(--accent-color);
            color: #fff;
            padding: 10px 20px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            transition: opacity 0.2s;
            display: none; /* Erst nach Fertigstellung sichtbar */
        }

        .btn-back:hover {
            opacity: 0.9;
        }
    </style>
</head>
<body>

<div class="container">
    <div class="card">
        <div class="header">
            <h1>⚡ yt-dlp Updater</h1>
            <span id="status-badge" class="status-badge working">Wird ausgeführt...</span>
        </div>

        <div id="terminal" class="terminal-window"></div>

        <div class="footer-action">
            <a href="index.php" id="btn-done" class="btn-back">Zurück zur Hauptseite</a>
        </div>
    </div>
</div>

<script>
    const term = document.getElementById('terminal');

    function appendLog(text) {
        const span = document.createElement('span');
        span.className = 'terminal-line';
        span.textContent = text;
        term.appendChild(span);
        term.scrollTop = term.scrollHeight; // Auto-scroll nach unten
    }

    function setStatus(type, message) {
        const badge = document.getElementById('status-badge');
        badge.className = 'status-badge ' + type;
        badge.textContent = message;
        
        if (type === 'success' || type === 'error') {
            document.getElementById('btn-done').style.display = 'inline-block';
        }
    }
</script>

<?php
// Befehl vorbereiten
// --break-system-packages verhindert Fehler auf neueren Linux/Python Docker-Images (Debian 12 / Ubuntu 23+)
/* $cmd = "python3 -m pip install --upgrade --break-system-packages yt-dlp 2>&1"; */

// no cache variante
$cmd = "python3 -m pip install --no-cache-dir --upgrade --break-system-packages yt-dlp 2>&1";

$descriptorspec = [
    0 => ["pipe", "r"], // stdin
    1 => ["pipe", "w"], // stdout
    2 => ["pipe", "w"]  // stderr
];

$process = proc_open($cmd, $descriptorspec, $pipes);

$already_latest = false;

if (is_resource($process)) {
    fclose($pipes[0]);

    // Live Output Zeile für Zeile abfangen und an das Frontend senden
    while (($line = fgets($pipes[1])) !== false) {
        if (strpos($line, 'Requirement already satisfied') !== false) {
            $already_latest = true;
        }
        echo "<script>appendLog(" . json_encode($line) . ");</script>";
        flush();
    }

    fclose($pipes[1]);
    fclose($pipes[2]);
    $return_value = proc_close($process);

    if ($return_value === 0) {
        if ($already_latest) {
            echo "<script>setStatus('success', 'Bereits aktuell!');</script>";
        } else {
            echo "<script>setStatus('success', 'Erfolgreich aktualisiert!');</script>";
        }
    } else {
        echo "<script>setStatus('error', 'Fehler beim Update!');</script>";
    }
    flush();
} else {
    echo "<script>setStatus('error', 'Prozess konnte nicht gestartet werden.');</script>";
}
?>

</body>
</html>
