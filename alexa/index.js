'use strict';
var http = require(`https`);

const SEVER_URL = process.env.RMP_SERVER;
const SERVER_PORT = process.env.RMP_PORT;
const SERVER_PASSWD = process.env.RMP_PASS;

function JSONstringify(json) {
  console.log(JSON.stringify(json, undefined, 2));
}

function httpRequest(host, port, path, method, query) {
  return new Promise((resolve, reject) => {
    const encodedData = JSON.stringify(query);
    const options = {
      host,
      port,
      path,
      method, 
    };

    options.headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(encodedData)
    };

    console.log('options', options);
    console.log('data', encodedData);

    let data = '';
    
    const req = http.request(options, (res) => {
      res.on('data', function (chunk) {
        data += chunk;
      });
  
      res.on('end', function() {
        resolve(data);
      });
    });

    req.on('error', (e) => {
      console.log('http error', e);
      reject(e.message);
    });

    // send the request
    req.write(encodedData);
    req.end();
  });
}

const emptyResponse = {
  version: '1.0',
  sessionAttributes: {},
  response: {}
};

const speechResponse = (msg, talk = true) => (
  {
    version: '1.0',
    sessionAttributes: {},
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: msg,
        ssml: talk ? `<speak>${msg}</speak>` : '',
        playBehavior: 'STOPPED'      
      },
    }
  }
);

const cardResponse = (title, msg) => (
  {
    version: '1.0',
    sessionAttributes: {},
    response: {
      card: {
        type: 'Simple',
        title: title,
        content: msg
      },
    }
  }
);

class RemoteMusicPlayer {
  constructor(serverUrl, port, password) {
    this.password = password;
    this.port = port;
    this.authToken = '';
    this.serverUrl = serverUrl;
    this.bitrate = 320;
    this.currentTrack = '';
    this.alexaAPI = '/alexa';
    this.prevAudioToken = null;
    this.currentAudioToken = null;
    this.pauseOffset = 0;
  }

  postRequest(path, data) {
    const postData = Object.assign({}, data, {token: this.authToken });
    return httpRequest(this.serverUrl, this.port, path, 'POST', postData);
  }

  getRequest(path) {
    const postData = Object.assign({}, { token: this.authToken });
    return httpRequest(this.serverUrl, this.port, path, 'GET', postData);
  }

  authenticate() {
    return this.postRequest('/authenticate', {password: this.password });
  }

  setAuthToken(authResponse) {
    const parsed = JSON.parse(authResponse);
    this.authToken =  parsed.token;

    console.log("Authorized", this.authToken);
  }

  getServerUrl() {
    return `${this.serverUrl}:${this.port}`;
  }
  
  getAudioURL(songId) {
    const setQuality = `quality=${this.bitrate}k`;
    const setToken = `token=${this.authToken}`;

    return `https://${this.getServerUrl()}/api/files/${songId}/stream?${setQuality}&transcode=false&${setToken}`;
  }

  setAudioToken(token) {
    this.currentAudioToken = token;
  }

  getAudioToken() {
    return this.currentAudioToken;
  }

  setAudioOffset(offset) {
    this.pauseOffset = offset;
  }

  getAudioOffset() {
    return this.pauseOffset;
  }
  async getAuthToken(callback) {
    await this.authenticate().then((resp) => this.setAuthToken(resp)).catch((err)=> {
      callback(null, speechResponse(`Failed to authenticate with server: ${err}`));
    });
  }

  async enqueueTrack(event, callback) {
    await this.playTrack(event, callback, 'ENQUEUE');
  }

  async resetPlaylist(event, callback) {
    await this.getAuthToken(callback);
    await this.getRequest('/alexa/resetplaylist');
  }

  async playArtist(event, callback, artist) {
    const payload = { artist };
    console.log("play artist: ", payload);
    await this.getAuthToken(callback);
    await this.postRequest('/alexa/artist', payload).then(async (resp) => {
      JSONstringify(resp);
      const response = JSON.parse(resp);
      if (response.playlist.length === 0) {
        callback(null, speechResponse(`I couldn't find any songs by ${artist}`));
      }
      else {
        await this.playTrack(event, callback);
      }
    });
  }

  async playSpecific(event, callback, song, artist) {
    const payload = { artist, song };
    console.log("play artist: ", payload);
    await this.getAuthToken(callback);
    await this.postRequest('/alexa/artist/song', payload).then(async (resp) => {
      JSONstringify(resp);
      const response = JSON.parse(resp);
      if (response.playlist.length === 0) {
        callback(null, speechResponse(`I couldn't find the song ${song} by ${artist}`));
      }
      else {
        await this.playTrack(event, callback);
      }
    });
  }

  async playTrack(event, callback, playBehavior = 'REPLACE_ALL') {
    await this.getAuthToken(callback);

    await this.getRequest('/alexa/random').then(async (resp) => {
      const response = JSON.parse(resp);
      const token = response.id;
      const url = this.getAudioURL(token);
      const stream = {
        token,
        url,
        offsetInMilliseconds: 0
      };

      if (playBehavior === 'ENQUEUE') {
        stream.expectedPreviousToken = this.getAudioToken();
      }

      const audioResp = {
        version: '1.0',
        sessionAttributes: {},
        response: {
          directives: [
            {
              type: 'AudioPlayer.Play',
              playBehavior: playBehavior,
              audioItem: {
                stream
              }
            }
          ],
          shouldEndSession: true
        }
      };
      console.log("AUDIO RESPONSE");
      JSONstringify(audioResp);
      callback(null, audioResp);
    }).catch((err) => {
      callback(null, `Error fetching random track from server: ${err}`);
    });
  }

  async resumeTrack(event, callback) {
    const token = this.getAudioToken();
    const url = this.getAudioURL(token);
    const offsetInMilliseconds = this.getAudioOffset();

    const resumeResp = {
      version: '1.0',
      sessionAttributes: {},
      response: {
        directives: [
          {
            type: 'AudioPlayer.Play',
            playBehavior: 'REPLACE_ALL',
            audioItem: {
              stream: {
                token,
                url,              
                offsetInMilliseconds
              }
            }
          }
        ],
        shouldEndSession: true
      }
    };
    console.log("RESUME RESPONSE", JSON.stringify(resumeResp, null, 4));
    callback(null, resumeResp);
  }

  async pauseTrack(event, callback) {
    callback(null, {
      version: '1.0',
      sessionAttributes: {},
      response: {
        directives: [
          {
            type: 'AudioPlayer.Stop',
          }
        ],
      }
    }); 
  }

  async stopTrack(event, context) {
    await this.pauseTrack(event, context);
  }
}

const getAudioPlayerData = (event) => {
  if (event.context.AudioPlayer) {
    return event.context.AudioPlayer;
  } else {
    return {
      token: event.request.token,
      offsetInMilliseconds: 0
    };
  }
};

exports.handler = async function(event, context, callback) {
  JSONstringify(event);

  const eventType = event.request.type;

  const player = new RemoteMusicPlayer(SEVER_URL, SERVER_PORT, SERVER_PASSWD);

  // Always have the most up-to-date info on what is playing.
  const { token, offset } = getAudioPlayerData(event);
  player.setAudioToken(token);
  player.setAudioOffset(offset);

  if (eventType === 'IntentRequest') {
    const intentMapping = {
      'ResetPlaylistIntent': async () => {
        await player.resetPlaylist();
        await player.playTrack(event, callback);
      },
      'PlayMusicIntent': async () => {

        const intentInfo = event.request.intent.slots;
        const artistInfo = intentInfo.artist;
        const songInfo = intentInfo.song;
        if (songInfo.value && artistInfo.value) {
          await player.playSpecific(event, callback, songInfo.value, artistInfo.value);
        } else if (artistInfo.value) {
          await player.playArtist(event, callback, artistInfo.value);
        } else {
          await player.playTrack(event, callback);
          //callback(null, speechResponse("No artist information found in request."));
        }
      },
      'AMAZON.NextIntent': async () => { await player.playTrack(event, callback) },
      'AMAZON.PauseIntent': async () => { await player.pauseTrack(event, callback) },
      'AMAZON.StopIntent': async () => { await player.stopTrack(event, callback) },
      'AMAZON.ResumeIntent': async () => { await player.resumeTrack(event, callback) },
    };

    const intent = event.request.intent.name
    if (intent in intentMapping) await intentMapping[intent]();
    else {
      callback(null, speechResponse(`I don't know how to handle the intent ${event.request.intent.name}`));
    }
  } 
  else if (eventType === 'AudioPlayer.PlaybackStarted') {
    callback(null, emptyResponse);
  }
  else if (eventType === 'AudioPlayer.PlaybackStopped') {
    callback(null, emptyResponse);
  }
  else if (eventType === 'AudioPlayer.PlaybackNearlyFinished') {
    await player.enqueueTrack(event, callback);
  }
  else {
    callback(null, speechResponse("I don't understand what the hell is going on here"));
  }
};
