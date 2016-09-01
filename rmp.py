#!/usr/bin/env python3

from flask import Flask, request, jsonify, redirect, url_for, render_template, send_file, Response, stream_with_context
import os
import sys
import subprocess
import uuid
import logging
import re
import signal
import time
from flask_cors import CORS, cross_origin

app = Flask(__name__)
CORS(app)

logging.basicConfig(stream=sys.stderr, level=logging.DEBUG)

GLOBAL_SETTINGS = {
    'music-dir': '.',
    'music-list-name': '.music',
    'mplayer-fifo-file': '/tmp/mplayer.fifo',
    'cache-dir': '.cache',
    'server-port': 5000,
    'debug-out': True,
    'MPlayerClass': None,
    'MusicListClass': None,
    'max-transcodes': 4,
    'stream-format': 'mp3',
#    'ffmpeg-flags': ["ffmpeg", "-y", "-hide_banner", "-loglevel", "panic"]
    'ffmpeg-flags': ["ffmpeg", "-y"]
}

AUDIO_EXT = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac", ".aiff"]
TRANSCODE_FROM = [".aac", ".wav", ".flac", ".m4a", ".aiff"]
STREAM_FORMAT = ["mp3", "wav", "ogg"]
STREAM_QUALITY = {
    'mp3': ["32k", "48k", "64k", "96k", "128k", "144k", "160k", "192k", "224k", "256k", "320k"],
    'wav': ["11025", "22050", "44100", "48000", "96000"],
    'ogg': ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
}
TRANSCODE_CMD = {
    'mp3':["-i", "{infile}", "-vn", "-ar", "44100", "-ac" , "2", "-ab", "{quality}", "-f", "mp3", "{outfile}"],
    'wav':["-i", "{infile}", "-vn", "-acodec", "pcm_s16le", "-ar", "{quality}", "-f", "wav", "{outfile}"],
    'ogg':["-i", "{infile}", "-vn", "-c:a", "libvorbis", "-q:a", "{quality}", "-f", "ogg", "{outfile}"]
}
AUDIO_MIMETYPES = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg'
}



def make_file(path, name, directory=False, parent=None):
    return {'path': path, 'name': name, 'directory': directory, 'id': str(uuid.uuid4()), 'children': [], 'parent': parent}


def scan_directory(path, name='.', parent='.'):
    fileMapping = {}
    node = make_file(path, name, True, parent)
    fileMapping[str(node['id'])] = node
    
    for root, dirs, files in os.walk(os.path.normpath(os.path.join(path, name))):
        newDirs = list(dirs)
        del(dirs[:])
        for file in files:
            ext =  os.path.splitext(file)
            if file[0] != '.' and ext[1] in AUDIO_EXT:
                newFile = make_file(root, file, False, node['id'])
                node['children'].append(newFile)
                fileMapping[newFile['id']] = newFile

        for d in newDirs:
            childNodes, childFiles = scan_directory(root, d, node['id'])
            if len(childFiles) > 1:
                node['children'].append(childNodes)
                fileMapping.update(childFiles)

        node['children'] = sorted(node['children'], key=lambda k: k['name'])
        
    return node, fileMapping


class MPlayer:

    def __init__(self):
        self.fifofile = os.path.abspath(GLOBAL_SETTINGS['mplayer-fifo-file'])
        self.process = None

        if not os.path.exists(self.fifofile):
            os.mkfifo(self.fifofile)

    def send_cmd(self, command, file=None):
        if file is None: file = self.fifofile

        with open(file, 'w') as fp:
            fp.write(str(command) + '\n')


    def mplayer_params(self, track, seek):
        defaults = ['mplayer', '-slave', '-input', 'file={}'.format(self.fifofile),'-ss', seek, track]

        if not GLOBAL_SETTINGS['debug-out']:
            defaults.extend(['-really-quiet'])

        return defaults

    def get_mplayer_response(self, respHeader):
        stdout_lines = iter(self.process.stdout.readline, "")
        for l in stdout_lines:
            regex = '^{}'.format(respHeader)
            m = re.search(regex, l)
            if m:
                return l.replace(respHeader+'=', '').strip().replace("'", '')

            
            
    def kill(self):
        if not self.is_running():
            return

        self.process.stdout.close()
        self.process.kill()
        self.process = None

    def is_running(self):
        if self.process is None: return False
        return self.process.poll() ==  None

    def mute(self):
        self.send_cmd('mute')

    def play(self, filepath, seek=0):
        self.kill()
        self.process = subprocess.Popen(self.mplayer_params(filepath,seek), stdout=subprocess.PIPE, universal_newlines=True)
        

    def pause(self):
        self.send_cmd('pause')

    def stop(self):
        self.kill()


    def get_info(self, info):

        tags = {
            'get_meta_artist': 'ANS_META_ARTIST',
            'get_meta_album': 'ANS_META_ALBUM',
            'get_meta_title': 'ANS_META_TITLE',
            'get_meta_genre': 'ANS_META_GENRE',
            'get_time_pos': 'ANS_TIME_POSITION',
            }

        self.send_cmd(info)
        return self.get_mplayer_response(tags[info])
        
    def get_playing_track_info(self):
        return {'pos': self.get_info('get_time_pos')}



                

        

class MusicList:

    def __init__(self, root):
        self.listFile = GLOBAL_SETTINGS['music-list-name']
        self.generate_music_list(root)
        self.transcodeProcess = []
        self.transcodeID = 0

        for i in range(0, GLOBAL_SETTINGS['max-transcodes']):
            self.transcodeProcess.append(None)

    def generate_music_list(self, musicRoot, outputFile=None):
        self.files, self.mapping = scan_directory(musicRoot)


    def get_file(self, identifier):
        if not identifier in self.mapping:
            logging.debug('Track number {} does not exist'.format(identifier))
            return None
        return self.mapping[identifier]

    def get_file_index(self, currentFile):
        parent = self.mapping[currentFile['parent']]
        if not parent:
            return None
        
        index = next((i for i, file in enumerate(parent['children']) if file['id'] == currentFile['id']), None)
        return parent, index
    
    def get_next_file(self, currentFile):
        if not currentFile or not currentFile['parent'] or currentFile['parent'] not in self.mapping:
            return None

        parent, index = self.get_file_index(currentFile)
        index = (index + 1) % len(parent['children'])
        return parent['children'][index]


    def get_audio_mtadata(self, identifier):

        response = {'artist': '', 'album': '', 'title': '', 'genre': ''}        
        
        file = self.get_file(identifier)

        if file is None:
            return response

        print("Getting metadata")
        path = os.path.join(file['path'], file['name'])
        args = list(GLOBAL_SETTINGS['ffmpeg-flags'])
        args.extend(['-i', path, '-f', 'ffmetadata', '-'])

        process = subprocess.Popen(args, stdout=subprocess.PIPE)
        output = process.communicate();

        data = output[0].decode().splitlines()
        data.sort()

        for l in data:
            info = l.split('=')
            if len(info) > 1:
                response[info[0]] = info[1]


        #get track length
        args = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", \
                "default=noprint_wrappers=1:nokey=1", path]
        process = subprocess.Popen(args, stdout=subprocess.PIPE)
        output = process.communicate()

        response['length'] = output[0].decode().strip()
        return response

    
    def search_media(self, key):

        key = key.lower()
        response = {"results": []}

        for k, value in self.mapping.items():
            if not value['directory'] and key in value['name'].lower():
                response['results'].append(k)

        return response

    def is_transcoding(self, id):
        return self.transcodeProcess[id].poll()
        

    def transcode_audio(self, path, quality=None, fmt=None):
        
        if fmt is None:
            fmt = GLOBAL_SETTINGS['stream-format']
        
        if quality is None or quality.lower() not in STREAM_QUALITY['{}'.format(fmt)]:
            selections = STREAM_QUALITY["{}".format(GLOBAL_SETTINGS['stream-format'])]
            quality = selections[len(selections)//2]
        
        
        self.transcodeID = (self.transcodeID + 1) % GLOBAL_SETTINGS['max-transcodes']
        proc = self.transcodeProcess[self.transcodeID]
        
        if  proc is not None and proc.poll():
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        
        ext = os.path.splitext(path)
        outfile = os.path.join(GLOBAL_SETTINGS["cache-dir"], "transcoded{}.audio".format(self.transcodeID))

        args = list(GLOBAL_SETTINGS['ffmpeg-flags'])
        args.extend(TRANSCODE_CMD['{}'.format(fmt)])

        args[args.index("{infile}")] =  path
        args[args.index("{quality}")] = quality
        args[args.index("{outfile}")] = outfile

        print(args)
        self.transcodeProcess[self.transcodeID] = subprocess.Popen(args)
        return (outfile, self.transcodeProcess[self.transcodeID])

    def extract_album_art(self, filepath):
        
        args = list(GLOBAL_SETTINGS['ffmpeg-flags'])

        outfile = os.path.join(GLOBAL_SETTINGS["cache-dir"], "curcover.jpg")
        args.extend(['-i', filepath, '-an', '-vcodec', 'copy', outfile])

        print(args)
        coverProc = subprocess.Popen(args)
        res = coverProc.communicate()
        return outfile, coverProc.returncode
    

    
'''
Program Entry
'''

def play_file(file, offset):
    GLOBAL_SETTINGS['MusicListClass'].currentFile = file
    GLOBAL_SETTINGS['MPlayerClass'].play(os.path.join(file['path'], file['name']), offset)


@app.route('/api/commands/pause', methods=['POST'])
def pause():
    GLOBAL_SETTINGS['MPlayerClass'].pause()
    return '', 200

@app.route('/api/commands/stop', methods=['POST'])
def stop():
    GLOBAL_SETTINGS['MPlayerClass'].stop()
    return '', 200

@app.route('/api/commands/info', methods=['POST'])
def get_info():
    return jsonify(**GLOBAL_SETTINGS['MPlayerClass'].get_playing_track_info())


@app.route('/api/commands/formats')
def get_quality():
    response = {
        'format': STREAM_FORMAT,
        'quality': STREAM_QUALITY 
    }
    return jsonify(**response)

@app.route('/api/files')
def files():
    obj = {
        'files': GLOBAL_SETTINGS['MusicListClass'].files,
        'count': len(GLOBAL_SETTINGS['MusicListClass'].mapping.keys())
    }
    return jsonify(**obj)

@app.route('/api/files/search/<string:keyword>')
def search(keyword):
    keyword = keyword.strip()
    if len(keyword) <= 0:
        return '', 400
    
    return jsonify(**GLOBAL_SETTINGS["MusicListClass"].search_media(keyword))



@app.route('/api/files/<string:identifier>')
def file(identifier):
    file = GLOBAL_SETTINGS['MusicListClass'].get_file(identifier)
    if not file:
        return '', 400
    return jsonify(**file)


@app.route('/api/files/<string:identifier>/cover')
def get_cover(identifier):

    file = GLOBAL_SETTINGS['MusicListClass'].get_file(identifier)
    filepath = os.path.join(file['path'], file['name'])
    
    path, code = GLOBAL_SETTINGS['MusicListClass'].extract_album_art(filepath)
    response = {
        'code': code,
        'path': path
    }

    return jsonify(**response)


@app.route('/api/files/<string:identifier>/play')
def play(identifier):
    offset = request.args.get('offset')
    file = GLOBAL_SETTINGS['MusicListClass'].get_file(identifier)
    if not file:
        return '', 400

    
    play_file(file, offset)
    return '', 200

@app.route('/api/files/<string:identifier>/data')
def metadata(identifier):
    data = GLOBAL_SETTINGS['MusicListClass'].get_audio_mtadata(identifier)
    return jsonify(**data)



@app.route('/<path:filename>')
def serving(filename):

    print("SERVING")
    destType = request.args.get('format')
    if destType is not None:
        destType = destType.lower()
        if destType not in STREAM_FORMAT:
            destType = GLOBAL_SETTINGS['stream-format']
    else:
        destType = GLOBAL_SETTINGS['stream-format']
            

            
    #allow user to force transcode all audio regardless if its already supported or not
    doTranscode = request.args.get('transcode')
    if doTranscode is not None:
        doTranscode = (doTranscode.lower() == 'true')
    else:
        doTranscode = False
        
    #allow user to adjust quality of streaming
    quality = request.args.get('quality')

    print("TRANSCODE OPTION: {}".format(doTranscode))
    print("QUALITY OPTION: {}".format(quality))
    
    newFile = filename
    ext = os.path.splitext(filename)


    if ext[1] in TRANSCODE_FROM or doTranscode:
        newFile, proc = GLOBAL_SETTINGS['MusicListClass'].transcode_audio(filename, quality, destType)
        #give ffmpeg some time to start transcoding
        time.sleep(1)
                
        @stream_with_context
        def generate(inFile, ffmpegProc):
            file = open(inFile, 'rb')
            doneTranscode = False;
            
            while True:
                #chunk = file.read(1024 * 512)
                chunk = file.read()
                if len(chunk) > 0:
                    yield chunk
                    
                #if no bytes were read, check if transcoding is still happening
                doneTranscode = ffmpegProc.poll() is not None
                if len(chunk) == 0 and doneTranscode:
                    break

                time.sleep(1)
                
            file.close()
            
        return Response(stream_with_context(generate(newFile, proc)), mimetype=AUDIO_MIMETYPES['{}'.format(destType)])
    
    #no transcoding, just streaming if audio is already in a streamable format
    elif ext[1].replace('.','') in STREAM_FORMAT:
        def generate():
            file = open(newFile, 'rb')
            while True:
                chunk = file.read()
                if chunk:
                    yield chunk
                else:
                    break
            file.close()

        sendtype=AUDIO_MIMETYPES['{}'.format(ext[1].replace('.',''))]
        return Response(stream_with_context(generate()), mimetype=sendtype)

    #for whatever isn't an audio file
    return send_file(newFile)
    


@app.route('/')
def togui():
    return redirect(url_for('index'))

@app.route('/gui')
def index():
    doStream = bool(request.args.get('stream'))
    return render_template('index.html', enableStream=doStream)





def args():

    #get port number
    try:
        idx = sys.argv.index('-p')
        if idx + 1 < len(sys.argv):
            GLOBAL_SETTINGS['server-port'] = sys.argv[idx + 1]
        else:
            print("Missing port value!")
            exit(1)
    except:
        print("Using default port: {}".format(GLOBAL_SETTINGS['server-port']))

    GLOBAL_SETTINGS['music-dir'] = sys.argv[-1]


def main():
    args()
    GLOBAL_SETTINGS['MPlayerClass'] = MPlayer()
    GLOBAL_SETTINGS['MusicListClass'] = MusicList(GLOBAL_SETTINGS['music-dir'])
    GLOBAL_SETTINGS['running-dir'] = os.path.dirname(os.path.realpath(__file__))

    try:
        os.stat(GLOBAL_SETTINGS["cache-dir"])
    except:
        os.mkdir(GLOBAL_SETTINGS["cache-dir"])

                
    app.run(host='0.0.0.0', threaded=True, port=GLOBAL_SETTINGS['server-port'])

if __name__ == '__main__':
    main()
