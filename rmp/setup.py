import os
import uuid
import sys
import logging

from flask import Flask
from flask_cors import CORS
from flask_compress import Compress

from musicdb import MusicList
from alexaplayer import AlexaPlayer
import globalsettings


class Startup:
    def __init__(self):
        self.setup()
        root_dir = os.path.join(globalsettings.CONFIG['running-dir'], '..')
        self.flask_app = Flask('rmp', root_path=root_dir)
        self.flask_app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False
        self.flask_app.config['JSON_AS_ASCII'] = False
        CORS(self.flask_app)
        Compress(self.flask_app)
        logging.basicConfig(stream=sys.stderr, level=logging.DEBUG)

    def args(self):
        # get port number
        try:
            idx = sys.argv.index('-p')
            if idx + 1 < len(sys.argv):
                globalsettings.CONFIG['server-port'] = sys.argv[idx + 1]
            else:
                logging.error("Missing port value!")
                exit(1)
        except:
            logging.info("Using default port: {}".format(
                globalsettings.CONFIG['server-port']))

        try:
            idx = sys.argv.index('-password')
            if idx + 1 < len(sys.argv):
                globalsettings.CONFIG['password'] = sys.argv[idx + 1]
            else:
                logging.error("Missing password value!")
                exit(1)
        except:
            globalsettings.CONFIG['password'] = globalsettings.CONFIG['default-password']
            logging.info("Using default password: {}".format(globalsettings.CONFIG['password']))
        
        
        globalsettings.CONFIG['music-dir'] = sys.argv[-1]

    def envvars(self):
        globalsettings.CONFIG['server-port'] = int(os.environ.get('RMP_PORT')) if os.environ.get('RMP_PORT') else globalsettings.CONFIG['server-port']
        print("PORT: " + str(globalsettings.CONFIG['server-port']))
        globalsettings.CONFIG['password'] = os.environ.get('RMP_PASSWORD') if os.environ.get('RMP_PASSWORD') else globalsettings.CONFIG['password']
        print("Password: " + globalsettings.CONFIG['password'])
        globalsettings.CONFIG['music-dir'] = os.environ.get('RMP_MUSIC_DIR') if os.environ.get('RMP_MUSIC_DIR') else globalsettings.CONFIG['music-dir']
        print("Music: " + globalsettings.CONFIG['music-dir'])
        
    def setup(self):
        self.args()
        self.envvars()
        globalsettings.CONFIG['MusicListClass'] = MusicList(globalsettings.CONFIG['music-dir'])
        globalsettings.CONFIG['AlexaPlayer'] = AlexaPlayer(globalsettings.CONFIG['MusicListClass'])
        globalsettings.CONFIG['running-dir'] = os.path.dirname(os.path.realpath(__file__))
        globalsettings.CONFIG['auth-token'] = str(uuid.uuid4())
        try:
            os.stat(globalsettings.CONFIG["cache-dir"])
        except:
            os.mkdir(globalsettings.CONFIG["cache-dir"])

    def getapp(self):
        return self.flask_app
        
    def run(self):
        self.flask_app.run(host='0.0.0.0', threaded=True, port=globalsettings.CONFIG['server-port'])