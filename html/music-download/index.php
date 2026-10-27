<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>Michi-Playlist Downloader</title>
    <link rel="icon" href="/mango_icon.png">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --accent-color: #22c55e;
            --accent-hover: #16a34a;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --input-bg: #0f172a;
            --border-color: #334155;
        }

        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
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
            max-width: 600px;
            padding: 20px;
            box-sizing: border-box;
        }

        .card {
            background-color: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 40px 30px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
            text-align: center;
        }

        .logo {
            width: 70px;
            height: 70px;
            margin-bottom: 15px;
            border-radius: 12px;
        }

        h1 {
            font-size: 24px;
            margin: 0 0 8px 0;
            font-weight: 700;
        }

        p.subtitle {
            color: var(--text-muted);
            font-size: 14px;
            margin-bottom: 30px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 15px;
            text-align: left;
        }

        .input-wrapper {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .input-wrapper label {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .search-bar {
            display: flex;
            gap: 8px;
        }

        input.field {
            width: 100%;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
            background-color: var(--input-bg);
            color: var(--text-main);
            font-size: 15px;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
            box-sizing: border-box;
        }

        input.field:focus {
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
        }

        .btn-submit {
            background-color: var(--accent-color);
            color: #ffffff;
            font-weight: 600;
            font-size: 15px;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.2s, transform 0.1s;
            white-space: nowrap;
        }

        .btn-submit:hover {
            background-color: var(--accent-hover);
        }

        .btn-submit:active {
            transform: scale(0.98);
        }

        .footer-tools {
            margin-top: 35px;
            padding-top: 20px;
            border-top: 1px solid var(--border-color);
            display: flex;
            justify-content: flex-end;
        }

        .btn-update {
            background: transparent;
            border: 1px solid var(--border-color);
            color: var(--text-muted);
            padding: 6px 12px;
            font-size: 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn-update:hover {
            border-color: var(--text-muted);
            color: var(--text-main);
        }

        @media (max-width: 500px) {
            .search-bar {
                flex-direction: column;
            }
            .card {
                padding: 25px 18px;
            }
        }
    </style>
</head>

<body>

    <div class="top-nav">
        <a href="/index.html">&larr; Home</a>
    </div>

    <div class="container">
        <div class="card">
            
            <img src="/mango_icon.png" alt="Logo" class="logo">
            <h1>Download Music</h1>
            <p class="subtitle">Füge Links oder Begriffe hinzu, um MP3s zu deiner Bibliothek hinzuzufügen.</p>

            <form action="download.php" method="post" class="form-group">
                
                <!-- Haupt-URL Searchbar -->
                <div class="input-wrapper">
                    <label for="song_url">YouTube URL / Link</label>
                    <div class="search-bar">
                        <input class="field" 
                               type="url" 
                               name="song_url" 
                               id="song_url" 
                               placeholder="https://www.youtube.com/watch?v=..." 
                               required 
                               autofocus>
                        <button type="submit" class="btn-submit">Download</button>
                    </div>
                </div>

                <!-- Erweiterte Suche (Optional) -->
                <div class="input-wrapper">
                    <label for="advanced_search">Advanced Text Search (Optional)</label>
                    <input class="field" 
                           type="text" 
                           name="advanced_search" 
                           id="advanced_search" 
                           placeholder="z.B. Interpret - Titel Zusatzinfos">
                </div>

            </form>

            <!-- Wartungs-Aktionen im Footer der Card -->
            <div class="footer-tools">
                <form action="update.php" method="POST">
                    <input type="submit" class="btn-update" value="⚡ yt-dlp Aktualisieren"/>
                </form>
            </div>

        </div>
    </div>

</body>
</html>
