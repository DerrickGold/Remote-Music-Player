#!/usr/bin/env python3

from flask import request, jsonify, redirect, url_for, render_template, send_file, Response, stream_with_context, json

from urllib import parse
import os
import sys
import uuid
import logging
import time
import random
from pathlib import Path


from filehashnode import FileHashNodeTree
import globalsettings
from musicdb import MusicList, guessTranscodedSize, makeRangeHeader
from setup import Startup

system = Startup()
app = system.getapp()

def authMiddleware():
    resp = {"status": 401}
    token = request.args.get('token')
    if token is None:
        data = json.loads(request.data)
        token = data.get('token')
        
    if token is not None:
        resp["status"] = 200 if token == globalsettings.CONFIG['auth-token'] else resp["status"]

    return resp


'''==================================================
 Routes
=================================================='''

@app.route('/api/commands/formats')
def get_quality():
    resp = authMiddleware()
    if resp['status'] == 200:
        resp = {
            'format': globalsettings.STREAM_FORMAT,
            'quality': globalsettings.STREAM_QUALITY
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

    root_dir = globalsettings.CONFIG['MusicListClass'].root
    updated = globalsettings.CONFIG['MusicListClass'].latest_rescan_diff()
    resp = {'more': False, 'time': updated, 'added': [], 'removed': []}
    if lastUpdate >= updated:
        #if the last update time matches both the client and the server
        #check for new files on the server to push
        #otherwise, we just need to sync the client up with the server
        oldHash = globalsettings.CONFIG['MusicListClass'].fileHash
        RescanHash = FileHashNodeTree(root_dir)
        RescanHash.scan_directory(root_dir, '.', '.', oldHash)
        RescanHash.resolve_scan_diff(root_dir, '.', '.', oldHash)
        #merge the new files added back into the original file tree
        resp['added'] = RescanHash.get_files()
        resp['removed'] = oldHash.merge_scan_diff(RescanHash)
        globalsettings.CONFIG['MusicListClass'].save_rescan_diff(RescanHash, resp['removed'])
        resp['time'] = globalsettings.CONFIG['MusicListClass'].latest_rescan_diff()
    else:
        diffsList = globalsettings.CONFIG['MusicListClass'].get_rescan_diffs(lastUpdate)
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
        'root' : globalsettings.CONFIG['music-dir'],
        'files': globalsettings.CONFIG['MusicListClass'].fileHash.get_files(),
        'count': len(globalsettings.CONFIG['MusicListClass'].mapping.keys())
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

    return jsonify(**globalsettings.CONFIG["MusicListClass"].search_media(keyword))


@app.route('/api/files/<string:identifier>')
def file(identifier):
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    file = globalsettings.CONFIG['MusicListClass'].get_file(identifier)
    if not file:
        return '', 400
    return jsonify(**file)

@app.route('/api/files/<string:identifier>/cover')
@app.route('/api/files/<string:identifier>/cover/<string:covername>')
def get_cover(identifier, covername=None):
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    filepath = globalsettings.CONFIG['MusicListClass'].get_file_path(identifier)
    if filepath is None: return '', 400
    elif covername is not None:
        path, code = globalsettings.CONFIG["MusicListClass"].cache_album_art(filepath, covername)
        response = {
            'code': code,
            'path': path
        }
        return jsonify(**response)
    else:
        path, code = globalsettings.CONFIG['MusicListClass'].extract_album_art(filepath)
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
    file = globalsettings.CONFIG['MusicListClass'].get_file(identifier)
    if not file:
        return '', 400

    play_file(file, offset)
    return '', 200


@app.route('/api/files/<string:identifier>/data')
def metadata(identifier):
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    data = globalsettings.CONFIG['MusicListClass'].get_audio_metadata(identifier)
    return jsonify(**data)


@app.route('/api/files/<string:identifier>/stream')
def streamAudio(identifier):
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)
    
    filename = globalsettings.CONFIG['MusicListClass'].get_file_path(identifier)
    if not file:
        return '', 400

    destType = request.args.get('format')
    if destType is not None:
        destType = destType.lower()
        if destType not in globalsettings.STREAM_FORMAT:
            destType = globalsettings.CONFIG['stream-format']
    else:
        destType = globalsettings.CONFIG['stream-format']

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
    if ext in globalsettings.TRANSCODE_FROM or doTranscode:
        data = globalsettings.CONFIG['MusicListClass'].get_file_metadata(newFile)
        guessTranscodedSize(destType, quality, data)
        
        newFile, proc = globalsettings.CONFIG['MusicListClass'].transcode_audio(
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
                chunk = file.read(globalsettings.CONFIG["stream-chunk"])
                if len(chunk) > 0:
                    yield chunk

                # if no bytes were read, check if transcoding is still
                # happening
                doneTranscode = ffmpegProc.poll() is not None
                if len(chunk) == 0 and doneTranscode:
                    break

            file.close()

        sendtype = globalsettings.AUDIO_MIMETYPES['{}'.format(destType)]
        resp = Response(stream_with_context(generate(newFile, proc, offset)), mimetype=sendtype, headers=headers)
        resp.status_code = 206
        return resp

    # no transcoding, just streaming if audio is already in a streamable format
    elif ext in globalsettings.STREAM_FORMAT:
        data = globalsettings.CONFIG['MusicListClass'].get_file_metadata(newFile)
        headers, offset = makeRangeHeader(data)

        def generate(inFile, pos):
            file = open(inFile, 'rb')
            if pos > 0 and pos < data['size']: file.seek(pos, 0)
            elif pos >= data['size']:
                file.close()
                return
            
            while True:
                chunk = file.read(globalsettings.CONFIG["stream-chunk"])
                if chunk:
                    yield chunk
                else:
                    break
            file.close()

        sendtype = globalsettings.AUDIO_MIMETYPES['{}'.format(ext)]
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
        if password == globalsettings.CONFIG['password']:
            resp["status"] = 200;
            resp["token"] = globalsettings.CONFIG['auth-token']

    return jsonify(**resp)


@app.route('/alexa/play', methods=['GET'])
def playTrack():
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)

    resp = globalsettings.CONFIG['AlexaPlayer'].get_next()
    resp['status'] = 200
    return jsonify(**resp)

@app.route('/alexa/random', methods=['GET'])
def randomTrack():
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)

    resp = globalsettings.CONFIG['AlexaPlayer'].get_random()
    resp['status'] = 200
    return jsonify(**resp)

@app.route('/alexa/artist', methods=['POST'])
def playArtist():
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)

    data = json.loads(request.data)
    artist = data.get('artist')
    playlist = globalsettings.CONFIG['AlexaPlayer'].filter_artist(artist)
    resp = { 'status': 200, 'playlist': playlist }
    return jsonify(**resp)

@app.route('/alexa/song', methods=['POST'])
def playSongs():
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)

    data = json.loads(request.data)
    song = data.get('song')
    playlist = globalsettings.CONFIG['AlexaPlayer'].filter_song(song)
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
    playlist = globalsettings.CONFIG['AlexaPlayer'].filter_artist_song(artist, song)
    resp = { 'status': 200, 'playlist': playlist }
    return jsonify(**resp)

@app.route('/alexa/resetplaylist', methods=['GET'])
def playAll():
    resp = authMiddleware()
    if resp['status'] != 200:
        return jsonify(**resp)

    globalsettings.CONFIG['AlexaPlayer'].play_all()
    resp = {'status': 200}
    return jsonify(**resp)
    
@app.route('/<path:filename>')
def serving(filename):
    if globalsettings.CONFIG['music-dir'] in filename:
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