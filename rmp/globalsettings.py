
import subprocess

CONFIG = {
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
    CONFIG['ffmpeg-flags'] = ["ffmpeg", "-y"]
    CONFIG['ffprobe-flags'] = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", \
                                        "default=noprint_wrappers=1:nokey=1"]
except OSError as e:
    CONFIG['ffmpeg-flags'] = ["avconv", "-y"]
    CONFIG['ffprobe-flags'] = ["avprobe", "-v", "error", "-show_format_entry", "duration"]


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
COVERART_CMD = ['-i', "{infile}", '-an', "-vf", "scale={}:-1".format(CONFIG["coverart_width"]), "{outfile}"]

AUDIO_MIMETYPES = {
    'mp3': 'audio/mp3',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg'
}

