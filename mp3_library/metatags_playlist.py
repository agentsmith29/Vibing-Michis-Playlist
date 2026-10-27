
# from tinytag import TinyTag
import glob
from eyed3 import id3
import os

# from variables import file_path_cache, file_path_audio, playlist_path
file_path_audio = '../michi-playlist/audio'
playlist_path = '../michi-playlist/playlists/'


files = glob.glob(file_path_audio+'/*.mp3')
files.sort()

tag = id3.Tag()

playlist = open(playlist_path + 'playlist.txt', 'w')
# print(len(files))

for f in files:
    # try:
        # tag = TinyTag.get(f)
    tag.parse(f)
    # except:
        # print('error', f)
        # continue
    f_name = f.split('/')[-1]
    if tag.artist == "":
        print(f, 'artist')
        # break
    if tag.title == "":
        print(f, 'title')
        # tag.title = f_name[:-4]
        # playlist.write('<div data-src="audio/{}" class="song" style> {}<br>{}</div>\n'.format(f_name, tag.title, tag.artist))
        # continue


    # playlist.write('<div data-src="audio/{}" class="song" style> {}<br>{}</div>\n'.format(f_name, tag.title, tag.artist))
    playlist.write('audio/{};{};{}\n'.format(f_name.replace(';',''), tag.title.replace(';',''), tag.artist.replace(';','')))

playlist.close()


