#!/usr/bin/python3

from flask import Flask
import os
import sys
import subprocess

app = Flask(__name__)

GLOBAL_SETTINGS = {
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
        self.generateMusicList(root)

        
    def generateMusicList(self, musicRoot, outputFile=None):
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
        

    
@app.route("/")
def hello():
    return "Hello, World!"


def main():
    print(sys.argv[0])
    musicDir = sys.argv[1]

    dir_path = os.path.dirname(os.path.realpath(__file__))
    
    music = MusicList(musicDir)
    mplayer = MPlayer()

    track = os.path.join(dir_path, music.GetTrack(666))    
    mplayer.Play(track)

    
    app.run()


if __name__ == "__main__":
    main()
