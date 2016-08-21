#!/usr/bin/env python3

from flask import Flask, request, jsonify
import os
import sys
import subprocess
import uuid
import logging

app = Flask(__name__)

logging.basicConfig(stream=sys.stderr, level=logging.DEBUG)

GLOBAL_SETTINGS = {
    'music-dir': sys.argv[1],
    'music-list-name': '.music',
    'mplayer-fifo-file': '/tmp/mplayer.fifo',
    'server-port': 25222,
    'debug-out':True
}

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

    def mplayer_params(self, track):
        defaults = ['mplayer', '-slave', '-input', 'file={}'.format(self.fifofile),track]

        if not GLOBAL_SETTINGS['debug-out']:
            defaults.extend(['-really-quiet'])

        return defaults

    def kill(self):
        self.process.kill()
        self.process = None

    def is_running(self):
        if self.process is None: return False
        return self.process.poll() ==  None

    def mute(self):
        self.send_cmd('mute')

    def play(self, filepath):
        if self.is_running():
            self.kill()

        self.process = subprocess.Popen(self.mplayer_params(filepath))

    def pause(self):
        self.send_cmd('pause')

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
        self.files = scan_directory(musicRoot)
        self.mapping = flatten_files(self.files)

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

    def get_next_file(self, currentFile):
        if not currentFile or not currentFile['parent'] or currentFile['parent'] not in self.mapping:
            return None
        parent = self.mapping[currentFile['parent']]
        if not parent:
            return None
        index = next((i for i, file in enumerate(parent['children']) if file['id'] == currentFile['id']), None)
        if index is None:
            return None
        index = (index + 1) % len(parent['children'])
        return parent['children'][index]


def make_file(path, name, directory=False, parent=None):
    return {'path': path, 'name': name, 'directory': directory, 'id': str(uuid.uuid4()), 'children': [], 'parent': parent}


def scan_directory(path, name='.', parent='.'):
    node = make_file(path, name, True, parent)
    for root, dirs, files in os.walk(os.path.normpath(os.path.join(path, name))):
        newDirs = list(dirs)
        del(dirs[:])
        for file in files:
            if file[0] != '.':
                node['children'].append(make_file(root, file, False, node['id']))

        for d in newDirs:
            node['children'].append(scan_directory(root, d, node['id']))

    return node


def flatten_files(root):
    files = {}
    files[str(root['id'])] = root
    for child in root['children']:
        if not child['directory']:
            files[child['id']] = child
        else:
            files.update(flatten_files(child))

    return files


music = MusicList(GLOBAL_SETTINGS['music-dir'])
mplayer = MPlayer()

def PlayFile(file):
    music.currentFile = file
    mplayer.play(os.path.join(file['path'], file['name']))

@app.route('/api/commands/next', methods=['POST'])
def next_song():
    if not mplayer.is_running():
        return '', 400
    file = music.get_next_file(music.currentFile)
    if file is None:
        return '', 400
    PlayFile(file)
    return '', 200

@app.route('/api/commands/pause', methods=['POST'])
def pause():
    mplayer.pause()
    return '', 200

@app.route('/api/commands/stop', methods=['POST'])
def stop():
    mplayer.Stop()
    return '', 200

@app.route('/api/files')
def files():
    obj = {
        'files': music.files,
        'count': len(music.mapping.keys())
    }
    return jsonify(**obj)

@app.route('/api/files/<string:identifier>')
def file(identifier):
    file = music.get_file(identifier)
    if not file:
        return '', 400
    return jsonify(**file)

@app.route('/api/files/<string:identifier>/play')
def play(identifier):
    file = music.get_file(identifier)
    if not file:
        return '', 400
    PlayFile(file)
    return '', 200

def main():
    print(sys.argv[0])
    GLOBAL_SETTINGS['running-dir'] = os.path.dirname(os.path.realpath(__file__))
    app.run()

if __name__ == '__main__':
    main()
