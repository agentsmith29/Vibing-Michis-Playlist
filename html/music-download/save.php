<?php
// Formular-Daten als Array sammeln
$payload = [
    'temp_audio_path' => $_POST['temp_audio_path'],
    'image_path'      => $_POST['image_path'],
    'title'           => $_POST['title'],
    'artist'          => $_POST['artist'],
    'album'           => $_POST['album'],
    'genre'           => $_POST['genre'],
    'year'            => $_POST['year']
];

$jsonPayload = json_encode($payload);

// Python-Script 2 ausführen
$cmd = "python3 save_metadata.py " . escapeshellarg($jsonPayload);
$output = shell_exec($cmd);
$result = json_decode($output, true);

if ($result && $result['status'] === 'success') {
    echo "Erfolgreich gespeichert unter: " . $result['file_path'];
} else {
    echo "Fehler beim Speichern: " . ($result['error'] ?? 'Unbekannter Fehler');
}
?>
