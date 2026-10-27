#!/lsiopy/bin/python3
# -*- coding: utf-8 -*-

"""
File: tagging_mp3_files.py

Created by: Michael T.
Date: 2025-07-28 22:46:01

Content:
    reads the mp3 files in the folder and tags them automatically

# download file
# add metadata
# create playlist for files
# update webserver files (audio + playlist)

"""

import os
import sys
import glob
import re
import yt_dlp
import eyed3
from eyed3.core import Date

from variables import file_path_cache
from fetch_itunes import get_search_result


if not os.path.isdir(file_path_cache):
    os.mkdir(file_path_cache)



if len(sys.argv) == 2: 
    URL = sys.argv[1]
    advanced_search = False
    search_text = ''
elif len(sys.argv) == 3:
    URL = sys.argv[1]
    advanced_search = True
    search_text = sys.argv[2]
else:
    print("Usage: python script.py <url>") 
    sys.exit(1) 

URL = URL.split('&')[0]

# URL = 'https://www.youtube.com/watch?v=kivUsDGWojU'

ydl_opts = {
    'quiet': True,
    'noprogress': True,
    'format': 'm4a/bestaudio/best',
    'postprocessors': [{  # Extract audio using ffmpeg
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'mp3',
    }]
}

try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        error_code = ydl.download(URL)
except Exception as e:
    print('Error during download.')
    print(e)


file = glob.glob('*.mp3')[0]
os.rename(file, file_path_cache+os.sep+file)


def Title(string):
    str_list = string.split(' ')
    str_list2 = []
    str_title = ''
    for i in str_list:
        str_list2.append(i.capitalize())
    str_title = ' '.join(str_list2)
    return str_title


# folder_mp3 = './new'
folder_mp3 = file_path_cache
files = os.listdir(folder_mp3)

for file in files:
    # print('### SET METADATA ###')
    file_name = file.replace('.mp3','')

    # remove unnecessary fields
    file_name = re.sub(r'\([^)]*\)', '', file_name)
    file_name = re.sub(r'\[.*?\]', '', file_name)
    file_name = file_name.replace(' -', '')
    file_name = file_name.replace('  ', ' ')
    file_name = file_name.replace('?', '')

    if file_name[-1] == ' ':
        file_name = file_name[:-1]
    # I should also replace emojies and stuff like that

    # search with itunes
    if advanced_search:
        tags, image_path = get_search_result(search_text)
    else:
        tags, image_path = get_search_result(file_name)

    if tags is None:
        exit(1)


    artist = Title(tags['artistName'])
    title = Title(tags['trackName'])
    album = Title(tags['collectionName'])
    genre = Title(tags['primaryGenreName'])
    year = int(tags['releaseDate'][0:4])

    # write metatags to file
    audiofile = eyed3.load(folder_mp3+os.sep+file)
    audiofile.initTag(version=(2, 3, 0))  # version is importantaudiofile = eyed3.load(file)
    audiofile.tag.artist = artist
    audiofile.tag.album = album
    audiofile.tag.album_artist = artist
    audiofile.tag.title = title
    audiofile.tag.genre = genre
    audiofile.tag.year = year
    audiofile.tag.release_date = Date(year=year)
    audiofile.tag.recording_date = Date(year=year)


    # Read image from local file (for demonstration and future readers)
    with open(image_path, "rb") as image_file:
        imagedata = image_file.read()
    audiofile.tag.images.set(3, imagedata, "image/jpeg", u"cover")
    audiofile.tag.save()

    # new_file_name = tags['trackName'].replace(' ','_')+'.mp3'
    new_file_name = title+'.mp3'
    os.rename(folder_mp3+os.sep+file, folder_mp3+os.sep+new_file_name)


    print('<div class="container-flex">')
    print('<img src="{}" alt="Album Cover">'.format(image_path))
    print('<div class="text-content">')
    print('<h3>Title: {}</h3>'.format(title))
    print('<p>Artist: {}</p>'.format(artist))
    print('<p>Album: {}</p>'.format(album))
    print('<p>Genre: {}</p>'.format(genre))
    print('<p>Year: {}</p>'.format(year))
    print('<p>File Name: {}</p>'.format(new_file_name))
    print('<input type="hidden" name="file_name" id="file_name" value="{}">'.format(new_file_name))
    print('</div>')
    print('</div>')

