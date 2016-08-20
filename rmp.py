#!/usr/bin/env python3

from flask import Flask
from flask import request
import os
import sys
import subprocess

app = Flask(__name__)

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

    def SendCmd(self, command, file=None):
        if file is None: file = self.fifofile

        with open(file, 'w') as fp:
            fp.write(str(command) + '\n')

    def MplayerParams(self, track):
        defaults = ['mplayer', '-slave', '-input', 'file={}'.format(self.fifofile),track]

        if not GLOBAL_SETTINGS['debug-out']:
            defaults.extend(['-really-quiet'])

        return defaults

    def Kill(self):
        self.process.kill()
        self.process = None

    def IsRunning(self):
        if self.process is None: return False
        return self.process.poll() ==  None

    def Mute(self):
        self.SendCmd('mute')

    def Play(self, filepath):
        if self.IsRunning():
            self.Kill()

        self.process = subprocess.Popen(self.MplayerParams(filepath))

    def Pause(self):
        self.SendCmd('pause')


class MusicList:

    def __init__(self, root):
        self.listFile = GLOBAL_SETTINGS['music-list-name']
        self.totalFileCount = 0;
        self.GenerateMusicList(root)


    def GenerateMusicList(self, musicRoot, outputFile=None):
        if outputFile is None: outputFile = self.listFile

        try:
            listFile = open(outputFile, "w")
        except (e):
            print(e)
            return

        self.totalFileCount = 0;

        for root, dirs, files in os.walk(musicRoot):
            for f in files:
                self.totalFileCount+=1
                if self.totalFileCount % 1000 == 0:
                    print("Generating music list... {}".format(self.totalFileCount))

                if f[0] != '.':
                    listFile.write(os.path.join(root, f) + '\n')

        listFile.close()
        print("Scanned {} files.".format(self.totalFileCount))
        return self.totalFileCount

    def Count(self):
        return self.totalFileCount

    def GetTrack(self, trackNum):

        if trackNum >= self.totalFileCount or trackNum < 0:
            if GLOBAL_SETTINGS['debug-out']: print('Track number {} does not exist'.format(trackNum))
            return None

        trackpath = None
        list = open(self.listFile, 'r')
        for i, path in enumerate(list):
            if i == trackNum - 1:
                trackpath = path
                break

        list.close()
        return trackpath.replace('\n', '')


music = MusicList(GLOBAL_SETTINGS['music-dir'])
mplayer = MPlayer()

@app.route("/")
def hello():
    return "Hello, World!"


@app.route("/next", methods=['POST'])
def next():
    if request.method == 'POST':
        track = os.path.join(GLOBAL_SETTINGS['running-dir'], music.GetTrack(1123))
        mplayer.Play(track)


def main():
    print(sys.argv[0])
    GLOBAL_SETTINGS['running-dir'] = os.path.dirname(os.path.realpath(__file__))

    track = os.path.join(GLOBAL_SETTINGS['running-dir'], music.GetTrack(666))

    mplayer.Play(track)

    app.run()


if __name__ == "__main__":
    main()
