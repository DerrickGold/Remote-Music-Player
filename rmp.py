#!/usr/bin/env python3

from flask import Flask, request, jsonify, redirect, url_for, render_template, send_file, Response, stream_with_context, json
from werkzeug.datastructures import Headers
from urllib import parse
import os
import sys
import subprocess
import uuid
import logging
import re
import signal
import time
import shutil
import random
import difflib
from pathlib import Path
from flask_cors import CORS, cross_origin
from flask_compress import Compress

GLOBAL_SETTINGS = {
    'music-dir': '.',
    'music-list-name': '.music',
    'mplayer-fifo-file': '/tmp/mplayer.fifo',
    'cache-dir': '.cache',
    'server-port': 5000,
    'debug-out': True,
    'MusicListClass': None,
    'AlexaPlayer': None,
    'max-transcodes': 4,
    'stream-format': 'mp3',
    'stream-chunk': 1024 * 512,
    'default-password': "admin",
    'password': "",
    'auth-token': "",
    "coverart_width": "500"
}


# check if ffmpeg is installed, otherwise switch to avconv for pi users
try:
    subprocess.call(["ffmpeg", "-loglevel", "panic"])
    GLOBAL_SETTINGS['ffmpeg-flags'] = ["ffmpeg", "-y"]
    GLOBAL_SETTINGS['ffprobe-flags'] = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", \
                                        "default=noprint_wrappers=1:nokey=1"]
except OSError as e:
    GLOBAL_SETTINGS['ffmpeg-flags'] = ["avconv", "-y"]
    GLOBAL_SETTINGS['ffprobe-flags'] = ["avprobe", "-v", "error", "-show_format_entry", "duration"]


AUDIO_EXT = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac", ".aiff"]
COVER_EXT = [".jpg", ".png", ".bmp"]
TRANSCODE_FROM = ["aac", "wav", "flac", "m4a", "aiff"]
STREAM_FORMAT = ["mp3", "wav"]
STREAM_QUALITY = {
    'mp3': ["32k", "48k", "64k", "96k", "128k", "144k", "160k", "192k", "224k", "256k", "320k"],
    'wav': ["11025", "22050", "44100", "48000", "96000"],
    'ogg': ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
}
TRANSCODE_CMD = {
    'mp3': ["-i", "{infile}", "-vn", "-ar", "44100", "-ac", "2", "-b:a", "{quality}", "-f", "mp3", "{outfile}"],
    'wav': ["-i", "{infile}", "-vn", "-acodec", "pcm_s16le", "-ar", "{quality}", "-f", "wav", "{outfile}"],
    'ogg': ["-i", "{infile}", "-vn", "-c:a", "libvorbis", "-q:a", "{quality}", "-f", "ogg", "{outfile}"]
}
COVERART_CMD = ['-i', "{infile}", '-an', "-vf", "scale={}:-1".format(GLOBAL_SETTINGS["coverart_width"]), "{outfile}"]
AUDIO_MIMETYPES = {
    'mp3': 'audio/mp3',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg'
}

TRANSCODE_CACHE = []

def make_file(path, name, directory=False, parent=None):
    id = str(uuid.uuid4())
    entry = {
        'name': name,
        'directory': directory,
        'id': str(uuid.uuid4()),
        'parent': parent
    }
    
    if directory:
        entry['children'] = []
    
    return entry


def dircmp(a, b):
    if a['directory'] and not b['directory']:
        return -1
    elif not a['directory'] and b['directory']:
        return 1
    elif a['name'].lower() < b['name'].lower():
        return -1
    elif a['name'].lower() > b['name'].lower():
        return 1

    return 0


def cmp_to_key(comparator):
    'Convert a cmp= function into a key= function'
    class K(object):

        def __init__(self, obj, *args):
            self.obj = obj

        def __lt__(self, other):
            return comparator(self.obj, other.obj) < 0

        def __gt__(self, other):
            return comparator(self.obj, other.obj) > 0

        def __eq__(self, other):
            return comparator(self.obj, other.obj) == 0

        def __le__(self, other):
            return comparator(self.obj, other.obj) <= 0

        def __ge__(self, other):
            return comparator(self.obj, other.obj) >= 0

        def __ne__(self, other):
            return comparator(self.obj, other.obj) != 0

    return K

class FileHashNodeTree:
    def __init__(self, root):
        self.root = root
        self.nodes = None
        self.mappings = None
        self.pathmappings = None

    def get_files(self): return self.nodes
    def get_mapping(self): return self.mappings
    def get_pathhash(self): return self.pathmappings
        
    def scan_directory(self, path, name='.', parent='.', oldHash=None):
        oldPathHash = None
        if oldHash is not None and type(oldHash) is FileHashNodeTree:
            oldPathHash = oldHash.get_pathhash()
            
        self.nodes, self.mappings, self.pathmappings = self.scan_directory_r(path, name, parent, oldPathHash)

    def scan_directory_r(self, path, name='.', parent='.', oldPathHash=None):
        fileMapping = {}
        pathMapping = {}
        curDirPath = os.path.normpath(os.path.join(path, name))
        node = make_file(path, name, True, parent)
        fileMapping[str(node['id'])] = node
        pathMapping[curDirPath] = node

        for root, dirs, files in os.walk(curDirPath):
            newDirs = list(dirs)
            del(dirs[:])
            for file in files:
                fullpath = os.path.normpath(os.path.join(curDirPath, file))
                if oldPathHash is not None and fullpath in oldPathHash:
                    continue
            
                ext = os.path.splitext(file)
                if file[0] != '.' and ext[1] in AUDIO_EXT:
                    newFile = make_file(root, file, False, node['id'])
                    node['children'].append(newFile)
                    fileMapping[newFile['id']] = newFile
                    pathMapping[fullpath] = newFile
                elif file[0] != '.' and ext[1] in COVER_EXT:
                    pathMapping[fullpath] = file
                    if 'covers' not in node: node['covers'] = []
                    node['covers'].append(file)
                

            for d in newDirs:
                childNodes, childFiles, childPaths = self.scan_directory_r(root, d, node['id'], oldPathHash)
                if len(childFiles) > 0:
                    if len(childFiles) == 1:
                        continue
                    
                    node['children'].append(childNodes)
                    fileMapping.update(childFiles)
                    pathMapping.update(childPaths)
                elif 'covers' in childNodes and len(childNodes['covers']) > 0:
                    for i, cover in enumerate(childNodes['covers']):
                        childNodes['covers'][i] = d + '/' + cover
                
                    if 'covers' not in node: node['covers'] = []
                    node['covers'].extend(childNodes['covers'])

            node['children'] = sorted(node['children'], key=cmp_to_key(dircmp))

        return node, fileMapping, pathMapping


    #If multiple scans are made to the file system, this function
    #will recurse through the new scan (which should contain only
    #the differences from the first scan with oldPathHash provided)
    #and attempt to match up node ID's with the ID's generated in the
    #initial scan
    #this resolved diff can be send to the client to merge
    def resolve_scan_diff(self, path='.', name='.', parent='.', otherFileHash=None):
        if otherFileHash is None or type(otherFileHash) is not FileHashNodeTree:
            return

        self.resolve_scan_diff_r(self.nodes, path, name, parent,  otherFileHash.get_pathhash())

    
    def resolve_scan_diff_r(self, diff, path='.', name='.', parent='.',  oldPathHash=None):
        curFile = os.path.normpath(os.path.join(path, name))
        if curFile in oldPathHash:
            diff['id'] = oldPathHash[curFile]['id']
            diff['parent'] = oldPathHash[curFile]['parent']
        else:
            diff['parent'] = parent

        if diff['directory'] and len(diff['children']):
            for c in diff['children']:
                self.resolve_scan_diff_r(c, curFile, c['name'], diff['id'], oldPathHash)


    def rm_node(self, node):
        if node['directory'] and 'children' in node:
            for child in node['children']:
                self.rm_node(child)

        parent = None
        if node['parent'] in self.mappings:
            parent = self.mappings[node['parent']]
        else:
            return
        
        for i, child in enumerate(parent['children']):
            if child['id'] == node['id']:
                parent['children'].pop(i)
                break
            
        self.mappings.pop(node['id'], None)


    def merge_scan_diff(self, otherHash):
        if otherHash is None or type(otherHash) is not FileHashNodeTree:
            return

        self.merge_scan_diff_r(otherHash.nodes, otherHash.root)
        rmPathList = []
        rmNodes = []
        # now remove any files that no longer exist in the file system
        for path in self.pathmappings:
            t = os.path.realpath(path)
            if os.path.exists(t): continue
            print("{} does not exist?".format(t))
            #if it no longer exists...
            node = self.pathmappings[path]
            if type(node) is not dict: continue
            #remove all references to that node
            #self.pathmappings.pop(path, None)
            rmPathList.append(path)
            rmNodes.append(node['id'])
            self.rm_node(node)

        for path in rmPathList: self.pathmappings.pop(path, None)
        return rmNodes

    
    def merge_scan_diff_r(self, node, path='.', name='.', top=False):
        curFileName = os.path.normpath(os.path.join(path, name))
        
        if node['id'] not in self.mappings:
            if node['parent'] != '.':
                parent = self.mappings[node['parent']]
                if not top:
                    parent['children'].append(node)
                    parent['children'] = sorted(parent['children'], key=cmp_to_key(dircmp))
                    top = True

                
            self.mappings[node['id']] = node
            self.pathmappings[curFileName] = node
        
        if node['directory'] and 'children' in node:
            for c in node['children']:
                self.merge_scan_diff_r(c, curFileName, c['name'], top)

            node['children'] = sorted(node['children'], key=cmp_to_key(dircmp))
        

        


def guessTranscodedSize(codec, quality, metadata):
    # currently assumes all audio will end up as stereo output
    quality = re.findall('\d+', quality)[0]

    try:
        if codec == "wav":
            # frequncy * bitdepth (16 bits = 2 bytes) * num of channels (2 =
            # stereo) * length (seconds)
            metadata['size'] = int(quality) * 4 * int(float(metadata['length']))
        elif codec == "mp3":
            # bitrate (kilobits) * 8 to convert to kilobytes * length (seconds)
            metadata['size'] = int(int(quality) * 1000 // 8 * float(metadata['length']))
    except ValueError:
        print("Invalid track length")
        

def makeRangeHeader(metadata):
    begin = 0
    end = metadata['size']
    headers = Headers()
    if request.headers.has_key("Range"):
        headers.add('Accept-Ranges', 'bytes')
        ranges = re.findall(r"\d+", request.headers["Range"])
        begin = int(ranges[0])
        if len(ranges) > 1:
            end = int(ranges[1])
        headers.add('Content-Range', 'bytes %s-%s/%s' %
                    (str(begin), str(end - 1), str(end)))

    headers.add('Content-Length', str((end - begin)))
    headers.add('X-Content-Duration', metadata['length'])
    return headers, begin


class ListHistory:
    def __init__(self, date, filehash, deleted):
        self.date = date
        self.filehashnode = filehash
        self.deleted = deleted
        
class MusicList:

    def __init__(self, root):
        self.listFile = GLOBAL_SETTINGS['music-list-name']
        self.fileHash = FileHashNodeTree(root)
        self.generate_music_list(root)
        self.transcodeProcess = []
        self.transcodeID = 0
        self.art_cache_path = os.path.join(GLOBAL_SETTINGS["cache-dir"], "curcover.jpg")
        self.root = root
        self.listDiffs = []
        
        for i in range(0, GLOBAL_SETTINGS['max-transcodes']):
            self.transcodeProcess.append(None)

    def generate_music_list(self, musicRoot, outputFile=None):
        self.fileHash.scan_directory(musicRoot)
        self.mapping = self.fileHash.get_mapping()

    def get_file(self, identifier):
        if not identifier in self.mapping:
            logging.debug('Track number {} does not exist'.format(identifier))
            return None
        return self.mapping[identifier]

    def get_file_path(self, identifier):
        
        file = self.get_file(identifier)
        if file is None: return None
        curFile = file
        outpath = curFile['name']
        while curFile['parent'] != '.':
            parent = self.get_file(curFile['parent'])
            outpath = os.path.join(parent['name'], outpath)
            curFile = parent

        return os.path.join(GLOBAL_SETTINGS['music-dir'], outpath)

    def get_file_metadata(self, path):
        response = {'artist': '', 'album': '', 'title': '', 'genre': ''}
        logging.debug("Getting metadata")
        args = list(GLOBAL_SETTINGS['ffmpeg-flags'])
        args.extend(['-i', path, '-f', 'ffmetadata', '-'])

        process = subprocess.Popen(args, stdout=subprocess.PIPE)
        output = process.communicate()

        data = output[0].splitlines()
        data.sort()

        for l in data:
            info = l.decode().split('=')
            if len(info) > 1:
                response[info[0]] = info[1]

        # get track length
        args = list(GLOBAL_SETTINGS['ffprobe-flags'])
        args.append(path)
        process = subprocess.Popen(args, stdout=subprocess.PIPE)
        output = process.communicate()

        response['length'] = output[0].decode().strip()
        response['size'] = os.path.getsize(path)
        return response

    def get_audio_metadata(self, identifier):
        response = {'artist': '', 'album': '', 'title': '', 'genre': ''}
        path = self.get_file_path(identifier)
        if path is None: return response
        return self.get_file_metadata(path)

    def search_media(self, key):

        key = key.lower()
        response = {}

        for k, value in self.mapping.items():
            if not value['directory'] and key in value['name'].lower():
                response['{}'.format(value['id'])] = 1
                # response['results'].append(k)

        return response


    def is_transcoding(self, id):
        return self.transcodeProcess[id].poll()

    def transcode_audio(self, path, quality=None, fmt=None):
        if fmt is None:
            fmt = GLOBAL_SETTINGS['stream-format']

        if quality is None or quality.lower() not in STREAM_QUALITY['{}'.format(fmt)]:
            selections = STREAM_QUALITY[
                "{}".format(GLOBAL_SETTINGS['stream-format'])]
            quality = selections[len(selections) // 2]

        #check if audio has already been previously transcoded
        if len(TRANSCODE_CACHE) > 0:
            for c in TRANSCODE_CACHE:
                if c['infile'] == path:
                    logging.debug("FOUND CACHE OBJ: ")
                    logging.debug(c)
                    return (c['outfile'], c['proc'])
            
        self.transcodeID = (self.transcodeID +
                            1) % GLOBAL_SETTINGS['max-transcodes']
        proc = self.transcodeProcess[self.transcodeID]

        try:
            if proc is not None and proc.poll() and os.getpgid(proc.pid):
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except ProcessLookupError:
            logging.debug("Process: " + str(proc.pid) + " no longer exists....")

        ext = os.path.splitext(path)
        outfile = os.path.join(GLOBAL_SETTINGS["cache-dir"], "transcoded{}.audio".format(self.transcodeID))
        
        #delete old cache file before transcoding new one
        try:
            tfh = open(outfile, 'rb')
            tfh.close()
            os.unlink(outfile)
        except:
            pass
        
        args = list(GLOBAL_SETTINGS['ffmpeg-flags'])
        args.extend(TRANSCODE_CMD['{}'.format(fmt)])

        args[args.index("{infile}")] = path
        args[args.index("{quality}")] = quality
        args[args.index("{outfile}")] = outfile

        logging.debug(args)
        self.transcodeProcess[self.transcodeID] = subprocess.Popen(args)
        cacheobj = {
            'infile': path,
            'outfile': outfile,
            'proc': self.transcodeProcess[self.transcodeID],
            'fmt': fmt,
            'quality': quality
        }
        if len(TRANSCODE_CACHE) < GLOBAL_SETTINGS['max-transcodes']:
            TRANSCODE_CACHE.append(cacheobj)
        else:
            TRANSCODE_CACHE[self.transcodeID] = cacheobj
            
        return (outfile, self.transcodeProcess[self.transcodeID])

    def isalbum_art_cached(self):
        return os.path.exists(self.art_cache_path)
    
    def clear_album_cache(self):
        if self.isalbum_art_cached():
            os.unlink(self.art_cache_path)
    
    def extract_album_art(self, filepath):
        self.clear_album_cache()
        args = list(GLOBAL_SETTINGS['ffmpeg-flags'])
        outfile = self.art_cache_path
        args.extend(COVERART_CMD)
        
        args[args.index("{infile}")] = filepath
        args[args.index("{outfile}")] = outfile

        logging.debug(args)
        coverProc = subprocess.Popen(args)
        res = coverProc.communicate()
        code = coverProc.returncode
        if not self.isalbum_art_cached():
            code = -1
        
        return outfile, code

    def cache_album_art(self, audiopath, covername):
        self.clear_album_cache()
        basepath = os.path.dirname(audiopath)
        outfile = self.art_cache_path
        shutil.copy2(os.path.join(basepath, covername), outfile)
        return outfile, 0

    def save_rescan_diff(self, filehash, deleted):
        self.listDiffs.append(ListHistory(int(time.time()), filehash, deleted))

    def latest_rescan_diff(self):
        if len(self.listDiffs) < 1: return 0
        return self.listDiffs[-1].date

    def get_rescan_diffs(self, lastUpdate):
        #return a list of all diffs after last update
        diffList = []
        for diff in self.listDiffs:
            if diff.date > lastUpdate:
                diffList.append(diff)

        return diffList


class AlexaPlayer:
    def __init__(self, music_list):
        self.music_list = music_list
        
        self.tracks = [v for k,v in self.music_list.mapping.items() if not v['directory']]
        self.artists = [v for k,v in self.music_list.mapping.items() if v['directory']]
        self.playlist = self.tracks

    def get_random(self):
        response = {}
        data = random.choice(self.playlist)
        response['id'] = data['id']
        return response

    def is_similar(self, first, second, ratio):
        sanitized = re.sub('[\[\]\-\.\(\)@!#\$%\^&\*_=+]*mp3*','',second)
        return difflib.SequenceMatcher(None, first, sanitized).ratio() > ratio or \
        first in sanitized

    def filter_artist(self, artist):
        #allFolders = [v for v in self.artists if artist.lower() in v['name'].lower()]
        allFolders = [v for v in self.artists if self.is_similar(artist.lower(), v['name'].lower(), 0.68)]
        self.playlist = []
        for a in allFolders:
            for s in a['children']:
                if not s['directory']: 
                    self.playlist.append(s)
                elif artist not in s['name']:
                    allFolders.append(s)

        return self.playlist

    def filter_artist_song(self, artist, song):
        artist_songs = self.filter_artist(artist)
        #self.playlist = [s for s in artist_songs if song.lower() in s['name'].lower()]
        self.playlist = [s for s in artist_songs if self.is_similar(song.lower(), s['name'].lower(), 0.68)]
        return self.playlist

    def play_all(self):
        self.playlist = self.tracks

    
'''==================================================
Program Entry
=================================================='''
class Startup:
    def args(self):
        # get port number
        try:
            idx = sys.argv.index('-p')
            if idx + 1 < len(sys.argv):
                GLOBAL_SETTINGS['server-port'] = sys.argv[idx + 1]
            else:
                logging.error("Missing port value!")
                exit(1)
        except:
            logging.info("Using default port: {}".format(
                GLOBAL_SETTINGS['server-port']))

        try:
            idx = sys.argv.index('-password')
            if idx + 1 < len(sys.argv):
                GLOBAL_SETTINGS['password'] = sys.argv[idx + 1]
            else:
                logging.error("Missing password value!")
                exit(1)
        except:
            GLOBAL_SETTINGS['password'] = GLOBAL_SETTINGS['default-password']
            logging.info("Using default password: {}".format(GLOBAL_SETTINGS['password']))
        
        
        GLOBAL_SETTINGS['music-dir'] = sys.argv[-1]

    def envvars(self):
        GLOBAL_SETTINGS['server-port'] = int(os.environ.get('RMP_PORT')) if os.environ.get('RMP_PORT') else GLOBAL_SETTINGS['server-port']
        print("PORT: " + str(GLOBAL_SETTINGS['server-port']))
        GLOBAL_SETTINGS['password'] = os.environ.get('RMP_PASSWORD') if os.environ.get('RMP_PASSWORD') else GLOBAL_SETTINGS['password']
        print("Password: " + GLOBAL_SETTINGS['password'])
        GLOBAL_SETTINGS['music-dir'] = os.environ.get('RMP_MUSIC_DIR') if os.environ.get('RMP_MUSIC_DIR') else GLOBAL_SETTINGS['music-dir']
        print("Music: " + GLOBAL_SETTINGS['music-dir'])
        
    def setup(self):
        self.args()
        self.envvars()
        GLOBAL_SETTINGS['MusicListClass'] = MusicList(GLOBAL_SETTINGS['music-dir'])
        GLOBAL_SETTINGS['AlexaPlayer'] = AlexaPlayer(GLOBAL_SETTINGS['MusicListClass'])
        GLOBAL_SETTINGS['running-dir'] = os.path.dirname(os.path.realpath(__file__))
        GLOBAL_SETTINGS['auth-token'] = str(uuid.uuid4())
        try:
            os.stat(GLOBAL_SETTINGS["cache-dir"])
        except:
            os.mkdir(GLOBAL_SETTINGS["cache-dir"])

    def run(self):
        app.run(host='0.0.0.0', threaded=True, port=GLOBAL_SETTINGS['server-port'])


system = Startup()
system.setup()

app = Flask(__name__)
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False
app.config['JSON_AS_ASCII'] = False
CORS(app)
Compress(app)
logging.basicConfig(stream=sys.stderr, level=logging.DEBUG)


def authMiddleware():
    resp = {"status": 401}
    token = request.args.get('token')
    if token is None:
        data = json.loads(request.data)
        token = data.get('token')
        
    if token is not None:
        resp["status"] = 200 if token == GLOBAL_SETTINGS['auth-token'] else resp["status"]

    return resp



'''==================================================
 Routes
=================================================='''

@app.route('/api/commands/formats')
def get_quality():
    resp = authMiddleware()
    if resp['status'] == 200:
        resp = {
            'format': STREAM_FORMAT,
            'quality': STREAM_QUALITY
        }
    return jsonify(**resp)

@app.route('/api/commands/rescan')
def rescanner():
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    lastUpdate = request.args.get('lastUpdate')
    if lastUpdate is None:
        lastUpdate = 0
    else:
        lastUpdate = int(lastUpdate)

    root_dir = GLOBAL_SETTINGS['MusicListClass'].root
    updated = GLOBAL_SETTINGS['MusicListClass'].latest_rescan_diff()
    resp = {'more': False, 'time': updated, 'added': [], 'removed': []}
    if lastUpdate >= updated:
        #if the last update time matches both the client and the server
        #check for new files on the server to push
        #otherwise, we just need to sync the client up with the server
        oldHash = GLOBAL_SETTINGS['MusicListClass'].fileHash
        RescanHash = FileHashNodeTree(root_dir)
        RescanHash.scan_directory(root_dir, '.', '.', oldHash)
        RescanHash.resolve_scan_diff(root_dir, '.', '.', oldHash)
        #merge the new files added back into the original file tree
        resp['added'] = RescanHash.get_files()
        resp['removed'] = oldHash.merge_scan_diff(RescanHash)
        GLOBAL_SETTINGS['MusicListClass'].save_rescan_diff(RescanHash, resp['removed'])
        resp['time'] = GLOBAL_SETTINGS['MusicListClass'].latest_rescan_diff()
    else:
        diffsList = GLOBAL_SETTINGS['MusicListClass'].get_rescan_diffs(lastUpdate)
        combinedDiffs = diffsList.pop(0)
        resp['removed'] = combinedDiffs.deleted
        resp['time'] = combinedDiffs.date
        resp['more'] = resp['time'] <= updated;
        resp['added'] = combinedDiffs.filehashnode.get_files()

    return jsonify(**resp)


@app.route('/api/files')
def files():
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    obj = {
        'root' : GLOBAL_SETTINGS['music-dir'],
        'files': GLOBAL_SETTINGS['MusicListClass'].fileHash.get_files(),
        'count': len(GLOBAL_SETTINGS['MusicListClass'].mapping.keys())
    }
    return jsonify(**obj)


@app.route('/api/files/search/<string:keyword>')
def search(keyword):
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    keyword = keyword.strip()
    if len(keyword) <= 0:
        return '', 400

    return jsonify(**GLOBAL_SETTINGS["MusicListClass"].search_media(keyword))


@app.route('/api/files/<string:identifier>')
def file(identifier):
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    file = GLOBAL_SETTINGS['MusicListClass'].get_file(identifier)
    if not file:
        return '', 400
    return jsonify(**file)

@app.route('/api/files/<string:identifier>/cover')
@app.route('/api/files/<string:identifier>/cover/<string:covername>')
def get_cover(identifier, covername=None):
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    filepath = GLOBAL_SETTINGS['MusicListClass'].get_file_path(identifier)
    if filepath is None: return '', 400
    elif covername is not None:
        path, code = GLOBAL_SETTINGS["MusicListClass"].cache_album_art(filepath, covername)
        response = {
            'code': code,
            'path': path
        }
        return jsonify(**response)
    else:
        path, code = GLOBAL_SETTINGS['MusicListClass'].extract_album_art(filepath)
        response = {
            'code': code,
            'path': path
        }

        return jsonify(**response)


@app.route('/api/files/<string:identifier>/play')
def play(identifier):
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    offset = request.args.get('offset')
    file = GLOBAL_SETTINGS['MusicListClass'].get_file(identifier)
    if not file:
        return '', 400

    play_file(file, offset)
    return '', 200


@app.route('/api/files/<string:identifier>/data')
def metadata(identifier):
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    data = GLOBAL_SETTINGS['MusicListClass'].get_audio_metadata(identifier)
    return jsonify(**data)


@app.route('/api/files/<string:identifier>/stream')
def streamAudio(identifier):
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    filename = GLOBAL_SETTINGS['MusicListClass'].get_file_path(identifier)
    if not file:
        return '', 400

    destType = request.args.get('format')
    if destType is not None:
        destType = destType.lower()
        if destType not in STREAM_FORMAT:
            destType = GLOBAL_SETTINGS['stream-format']
    else:
        destType = GLOBAL_SETTINGS['stream-format']

    # allow user to force transcode all audio regardless if its already
    # supported or not
    doTranscode = request.args.get('transcode')
    if doTranscode is not None:
        doTranscode = (doTranscode.lower() == 'true')
    else:
        doTranscode = False

    # allow user to adjust quality of streaming
    quality = request.args.get('quality')
    newFile = '{}'.format(filename)
    ext = os.path.splitext(filename)[1].lower()[1:]
    if ext in TRANSCODE_FROM or doTranscode:
        data = GLOBAL_SETTINGS['MusicListClass'].get_file_metadata(newFile)
        guessTranscodedSize(destType, quality, data)
        
        newFile, proc = GLOBAL_SETTINGS['MusicListClass'].transcode_audio(
            filename, quality, destType)
        headers, offset = makeRangeHeader(data)
        # try opening the output file until it's successful
        tfh = None
        while tfh is None:
            try:
                tfh = open(newFile, 'rb')
            except:
                # give ffmpeg some time to start transcoding
                time.sleep(1)

        tfh.close()
        @stream_with_context
        def generate(inFile, ffmpegProc, pos):
            file = open(inFile, 'rb')
            if pos > 0: file.seek(pos, 0)
            doneTranscode = False
            while True:
                chunk = file.read(GLOBAL_SETTINGS["stream-chunk"])
                if len(chunk) > 0:
                    yield chunk

                # if no bytes were read, check if transcoding is still
                # happening
                doneTranscode = ffmpegProc.poll() is not None
                if len(chunk) == 0 and doneTranscode:
                    break

            file.close()

        sendtype = AUDIO_MIMETYPES['{}'.format(destType)]
        resp = Response(stream_with_context(generate(newFile, proc, offset)), mimetype=sendtype, headers=headers)
        resp.status_code = 206
        return resp

    # no transcoding, just streaming if audio is already in a streamable format
    elif ext in STREAM_FORMAT:
        data = GLOBAL_SETTINGS['MusicListClass'].get_file_metadata(newFile)
        headers, offset = makeRangeHeader(data)

        def generate(inFile, pos):
            file = open(inFile, 'rb')
            if pos > 0 and pos < data['size']: file.seek(pos, 0)
            elif pos >= data['size']:
                file.close()
                return
            
            while True:
                chunk = file.read(GLOBAL_SETTINGS["stream-chunk"])
                if chunk:
                    yield chunk
                else:
                    break
            file.close()

        sendtype = AUDIO_MIMETYPES['{}'.format(ext)]
        resp = Response(stream_with_context(generate(newFile, offset)), mimetype=sendtype, headers=headers)
        resp.status_code = 206
        return resp

    # for whatever isn't an audio file
    return send_file(newFile)



@app.route('/authenticate', methods=['POST'])
def authenticate():
    resp = {"status": 401}
    data = request.data
    data = json.loads(data)
    if data is not None:
        password = data.get('password')
        if password == GLOBAL_SETTINGS['password']:
            resp["status"] = 200;
            resp["token"] = GLOBAL_SETTINGS['auth-token']

    return jsonify(**resp)


@app.route('/alexa/random', methods=['GET'])
def randomTrack():
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)

    resp = GLOBAL_SETTINGS['AlexaPlayer'].get_random()
    resp['status'] = 200
    return jsonify(**resp)

@app.route('/alexa/artist', methods=['POST'])
def playArtist():
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)

    data = json.loads(request.data)
    artist = data.get('artist')
    playlist = GLOBAL_SETTINGS['AlexaPlayer'].filter_artist(artist)
    resp = { 'status': 200, 'playlist': playlist }
    return jsonify(**resp)

@app.route('/alexa/artist/song', methods=['POST'])
def playArtistSong():
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)

    data = json.loads(request.data)
    artist = data.get('artist')
    song = data.get('song')
    playlist = GLOBAL_SETTINGS['AlexaPlayer'].filter_artist_song(artist, song)
    resp = { 'status': 200, 'playlist': playlist }
    return jsonify(**resp)

@app.route('/alexa/resetplaylist', methods=['GET'])
def playAll():
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)

    GLOBAL_SETTINGS['AlexaPlayer'].play_all()
    resp = {'status': 200}
    return jsonify(**resp)
    
@app.route('/<path:filename>')
def serving(filename):
    if GLOBAL_SETTINGS['music-dir'] in filename:
        resp = authMiddleware()
        if resp['status'] != 200:
            return jsonify(**resp)

    asPath = Path(filename)
    if len(asPath.parts) > 1 and 'private' not in asPath.parts:
        # for whatever isn't an audio file
        return send_file(filename)
    else:
        return jsonify(**{'status': 401})


@app.route('/')
def togui():
    return redirect(url_for('index'))


@app.route('/gui')
def index():
    doStream = bool(request.args.get('stream'))
    return render_template('index.html', enableStream=doStream)

        
if __name__ == '__main__':
    system.run()
