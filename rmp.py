#!/usr/bin/python3

from flask import Flask
import os
import sys

app = Flask(__name__)

MUSIC_LIST_NAME = ".music"

@app.route("/")
def hello():
    return "Hello, World!"



def generateMusicList(musicRoot, outputFile):

    try:
        listFile = open(outputFile, "w")
    except (e):
        print(e)
        return

    count = 0;
    
    for root, dirs, files in os.walk(musicRoot):
        for f in files:
            count+=1
            if count % 1000 == 0:
                print("Generating music list... {}".format(count))
            
            listFile.write(os.path.join(root, f).replace(musicRoot, '') + '\n')

    print("Scanned {} files.".format(count))
    
def main():
    musicDir = sys.argv[1]
    generateMusicList(musicDir, MUSIC_LIST_NAME)
    app.run()


if __name__ == "__main__":
    main()
