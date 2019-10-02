import difflib
import re
import random
import os

class AlexaPlayer:
    def __init__(self, music_list):
        self.music_list = music_list
        
        self.tracks = [v for k,v in self.music_list.mapping.items() if not v['directory']]
        self.artists = [v for k,v in self.music_list.mapping.items() if v['directory']]
        self.playlist = self.tracks
        self.currentTrack = 0

        self.shuffle = False
        self.sanitizer = str.maketrans("", "", "[]()@!#$%^*=+\\")
        self.spacer = str.maketrans('_-', '  ')

        self.numberMapping = {'1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'size',
            '7': 'seven', '8':'eight', '9': 'nine'
        }

    def get_next(self):
        response = {}
        data = self.playlist[self.currentTrack]
        response['id'] = data['id']
        self.currentTrack += 1
        return response
 
    def get_random(self):
        response = {}
        data = random.choice(self.playlist)
        response['id'] = data['id']
        return response

    def cleanup_filename(self, filename):
        noExtensionName = (os.path.splitext(filename)[0]).translate(self.spacer)
        sanitized = noExtensionName.translate(self.sanitizer)
        trackNoRemoved = re.sub(r'^.*[0-9]{2} ?[\.-]', ' ', sanitized)

        return trackNoRemoved

    def is_similar(self, first, filename, ratio):
        second = self.cleanup_filename(filename)
        textWords = second.split()
        spokenWords = first.split()
        textLen = len(textWords)
        spokenLen = len(spokenWords)
        matched = 0

        if spokenLen > textLen:
            return False

        elif spokenLen == 1:
            for word in textWords:
                if difflib.SequenceMatcher(None, word, spokenWords[0]).ratio() >= 0.9:
                    matched += 1

            return matched >= 1

        elif textLen == spokenLen:
            for spoken, text in zip(spokenWords, textWords):
                if difflib.SequenceMatcher(None, spoken, text).ratio() >= ratio:
                    matched += 1
        else:
            for word in textWords:
                for testWord in spokenWords:
                    if difflib.SequenceMatcher(None, word, testWord).ratio() >= ratio:
                        matched += 1

        matched_ratio = matched / textLen
        # print("Matched ratio {} for {}".format(matched_ratio, sanitized))
        print("{} Matched: {} words of {}".format(textWords, matched, textLen))
        return matched_ratio >= 0.5

    def filter_artist(self, artist):
        allFolders = [v for v in self.artists if artist in v['name'].lower() or self.is_similar(artist.lower(), v['name'].lower(), 0.68)]
        self.playlist = []
        for a in allFolders:
            for s in a['children']:
                if not s['directory'] and s not in self.playlist: 
                    self.playlist.append(s)
                elif s['directory']:
                    allFolders.append(s)

        return self.playlist

    def filter_artist_song(self, artist, song):
        artist_songs = self.filter_artist(artist)
        self.playlist = []
        for s in artist_songs:
            # attempt to remove artist from file name if it exists
            stripped_artist = s['name'].lower().replace(artist, '')
            if self.is_similar(song.lower(), stripped_artist, 0.68):
                self.playlist.append(s)

        return self.playlist


    def play_all(self):
        self.currentTrack = 0
        self.playlist = self.tracks

    def filter_song(self, song):
        self.play_all()
        self.playlist = [s for s in self.tracks if self.is_similar(song.lower(), s['name'].lower(), 0.68)]
        return self.playlist