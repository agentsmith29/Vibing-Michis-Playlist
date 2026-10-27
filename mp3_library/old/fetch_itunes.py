#!python3
# -*- coding: utf-8 -*-

"""
File: fetch_itunes.py

Created by: Michael T.
Date: 2025-07-29 01:18:43


fetch itunes images


"""

import os
import requests as re
import urllib.parse
import json
from difflib import SequenceMatcher
import numpy as np

SIZE = 800
IMAGES_PATH = 'cache_image'


search = 'baianá bakermat'


if not os.path.isdir(IMAGES_PATH):
    os.mkdir(IMAGES_PATH)

def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()

def fetch_itunes(search, limit=5):
    search_urlencode = urllib.parse.quote_plus(search.lower())

    url = "https://itunes.apple.com/search?term={}&country=us&entity=song&limit={}".format(search_urlencode, limit)
    response = re.get(url)

    data = json.loads(response.text)
    return data

def get_search_result(search):
    
    data = fetch_itunes(search)

    N_results = data['resultCount']
    if N_results == 0:
        print("error: no results for '{}'".format(search))
        return None, None

    probability = np.zeros(N_results)

    for i in range(N_results):
        tags = data['results'][i]

        artist = tags['artistName']
        album = tags['collectionName']
        title = tags['trackName']
        genre = tags['primaryGenreName']
        year = tags['releaseDate'][0:4]

        # metric for choosing the right result
        iwantthealbum = 1
        if 'remix' in album.lower():
            iwantthealbum = 0.8
        if 'mix' in album.lower():
            iwantthealbum = 0.8
        if 'soundtrack' in album.lower():
            iwantthealbum = 0.8
        if 'live' in album.lower():
            iwantthealbum = 0.6
        if 'single' in album.lower():
            iwantthealbum = 0.95
        if year not in search:
            iwantthealbum *= 0.5

        probability[i] = similar(search, artist) * similar(search, title) * iwantthealbum
        print('{}, {}, {}, {}, {:0.4f}'.format(title, artist, album, year, probability[i]))
        print('<br>')

    index_result = probability.argmax()
    prob_max = probability[index_result]
    print('Best Result {} with {:0.2f}%'.format(index_result+1, prob_max*100))
    tags = data['results'][probability.argmax()]

    small_image_url = data['results'][index_result]['artworkUrl100']
    large_image_url = small_image_url.replace('100x100', '{}x{}'.format(SIZE, SIZE))
    # print(large_image_url)

    img_data = re.get(large_image_url).content
    extension = large_image_url[-4:]
    album_name = search.replace(' ','_')
    album_name_clean = "".join(x for x in album_name if x.isalnum())
    album_name_clean = album_name_clean.replace('(','').replace(')','')
    file_path = IMAGES_PATH+os.sep+album_name_clean+extension
    with open(file_path, 'wb') as handler:
        handler.write(img_data)

    return tags, file_path

def fetch_itunes2(search, country, limit=5):
    search_urlencode = urllib.parse.quote_plus(search)

    url = "https://itunes.apple.com/search?term={}&country={}&entity=song&limit={}".format(search_urlencode, country, limit)
    response = re.get(url)

    data = json.loads(response.text)
    if data['resultCount'] == 0:
        print("error: no results for '{}'".format(search))
        print(data)
        return None
    else:
        return data

def michi():
    print('michi')



