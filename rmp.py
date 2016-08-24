#!/usr/bin/env python3

from flask import Flask, request, jsonify, redirect, url_for, render_template, send_file
import os
import sys
import subprocess
import uuid
import logging
import re

app = Flask(__name__)

logging.basicConfig(stream=sys.stderr, level=logging.DEBUG)

GLOBAL_SETTINGS = {
    'music-dir': '.',
    'music-list-name': '.music',
    'mplayer-fifo-file': '/tmp/mplayer.fifo',
    'server-port': 5000,
    'debug-out': True,
    'MPlayerClass': None,
    'MusicListClass': None
}

AUDIO_EXT = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"]


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
        self.totalFileCount = 0;
        self.generate_music_list(root)


    def generate_music_list(self, musicRoot, outputFile=None):
        if outputFile is None: outputFile = self.listFile

        try:
            listFile = open(outputFile, 'w')
        except (e):
            logging.error(e)
            return

        self.totalFileCount = 0;
        self.files, self.mapping = scan_directory(musicRoot)

        for root, dirs, files in os.walk(musicRoot):
            for f in files:
                self.totalFileCount+=1

                if f[0] != '.':
                    listFile.write(os.path.join(root, f) + '\n')

        listFile.close()
        logging.info('Scanned {} files.'.format(self.totalFileCount))
        return self.totalFileCount

    def count(self):
        return self.totalFileCount

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
        args = ["ffmpeg", "-i", path, "-f", "ffmetadata", "-"]
        process = subprocess.Popen(args, stdout=subprocess.PIPE)
        output = process.communicate();

        data = output[0].decode().splitlines()
        data.sort()

        for l in data:
            info = l.split('=')
            if len(info) > 1:
                response[info[0]] = info[1]

        return response

    
    def search_media(self, key):

        key = key.lower()
        response = {"results": []}

        for k, value in self.mapping.items():
            if not value['directory'] and key in value['name'].lower():
                response['results'].append(k)

        return response
        

        
        
    

    
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

@app.route('/api/files')
def files():
    obj = {
        'files': GLOBAL_SETTINGS['MusicListClass'].files,
        'count': len(GLOBAL_SETTINGS['MusicListClass'].mapping.keys())
    }
    return jsonify(**obj)

@app.route('/api/files/search/<string:keyword>')
def search(keyword):
    if len(keyword) <= 0:
        return '', 400
    
    return jsonify(**GLOBAL_SETTINGS["MusicListClass"].search_media(keyword))



@app.route('/api/files/<string:identifier>')
def file(identifier):
    file = GLOBAL_SETTINGS['MusicListClass'].get_file(identifier)
    if not file:
        return '', 400
    return jsonify(**file)



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



@app.route('/')
def togui():
    return redirect(url_for('index'))

@app.route('/gui')
def index():
    doStream = bool(request.args.get('stream'))
    return render_template('index.html', enableStream=doStream)



@app.route('/<path:filename>')
def serving(filename):
    return send_file(filename)
    

def args():
    try:
        idx = sys.argv.index('-p')
        if idx + 1 < len(sys.argv):
            GLOBAL_SETTINGS['server-port'] = sys.argv[idx + 1]
            
    except(ValueError):
        print("Using default port: {}".format(GLOBAL_SETTINGS['server-port']))
              

    GLOBAL_SETTINGS['music-dir'] = sys.argv[-1]


def main():
    args()
    GLOBAL_SETTINGS['MPlayerClass'] = MPlayer()
    GLOBAL_SETTINGS['MusicListClass'] = MusicList(GLOBAL_SETTINGS['music-dir'])
    GLOBAL_SETTINGS['running-dir'] = os.path.dirname(os.path.realpath(__file__))
    app.run(host='0.0.0.0', threaded=True, port=GLOBAL_SETTINGS['server-port'])

if __name__ == '__main__':
    main()
