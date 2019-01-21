import os
import logging
import subprocess
import globalsettings
import shutil
import signal
import re

from flask import request
from werkzeug.datastructures import Headers
from filehashnode import FileHashNodeTree

TRANSCODE_CACHE = []

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
        self.listFile = globalsettings.CONFIG['music-list-name']
        self.fileHash = FileHashNodeTree(root)
        self.generate_music_list(root)
        self.transcodeProcess = []
        self.transcodeID = 0
        self.art_cache_path = os.path.join(globalsettings.CONFIG["cache-dir"], "curcover.jpg")
        self.root = root
        self.listDiffs = []
        
        for i in range(0, globalsettings.CONFIG['max-transcodes']):
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

        return os.path.join(globalsettings.CONFIG['music-dir'], outpath)

    def get_file_metadata(self, path):
        response = {'artist': '', 'album': '', 'title': '', 'genre': ''}
        logging.debug("Getting metadata")
        args = list(globalsettings.CONFIG['ffmpeg-flags'])
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
        args = list(globalsettings.CONFIG['ffprobe-flags'])
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
            fmt = globalsettings.CONFIG['stream-format']

        if quality is None or quality.lower() not in globalsettings.STREAM_QUALITY['{}'.format(fmt)]:
            selections = globalsettings.STREAM_QUALITY[
                "{}".format(globalsettings.CONFIG['stream-format'])]
            quality = selections[len(selections) // 2]

        #check if audio has already been previously transcoded
        if len(TRANSCODE_CACHE) > 0:
            for c in TRANSCODE_CACHE:
                if c['infile'] == path:
                    logging.debug("FOUND CACHE OBJ: ")
                    logging.debug(c)
                    return (c['outfile'], c['proc'])
            
        self.transcodeID = (self.transcodeID +
                            1) % globalsettings.CONFIG['max-transcodes']
        proc = self.transcodeProcess[self.transcodeID]

        try:
            if proc is not None and proc.poll() and os.getpgid(proc.pid):
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except ProcessLookupError:
            logging.debug("Process: " + str(proc.pid) + " no longer exists....")

        ext = os.path.splitext(path)
        outfile = os.path.join(globalsettings.CONFIG["cache-dir"], "transcoded{}.audio".format(self.transcodeID))
        
        #delete old cache file before transcoding new one
        try:
            tfh = open(outfile, 'rb')
            tfh.close()
            os.unlink(outfile)
        except:
            pass
        
        args = list(globalsettings.CONFIG['ffmpeg-flags'])
        args.extend(globalsettings.TRANSCODE_CMD['{}'.format(fmt)])

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
        if len(TRANSCODE_CACHE) < globalsettings.CONFIG['max-transcodes']:
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
        args = list(globalsettings.CONFIG['ffmpeg-flags'])
        outfile = self.art_cache_path
        args.extend(globalsettings.COVERART_CMD)
        
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
