'use strict';
var http = require(`https`);

const SEVER_URL = process.env.RMP_SERVER;
const SERVER_PORT = process.env.RMP_PORT;
const SERVER_PASSWD = process.env.RMP_PASS;

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

  async getPlayerState() {
    return this.getRequest(this.alexaAPI).then((resp) => {
      const state = JSON.parse(resp);
      return state;
    }).catch((err) => {
      console.log("Error retrieving alexa player state from server", err);
      return {error: err};
    });
  }

  async enqueueTrack(event, callback) {
    await this.playTrack(event, callback, 'ENQUEUE');
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
      console.log("AUDIO RESPONSE", JSON.stringify(audioResp, null, 4));
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

exports.handler = async function(event, context, callback) {
  console.log('event', event);

  const eventType = event.request.type;

  const player = new RemoteMusicPlayer(SEVER_URL, SERVER_PORT, SERVER_PASSWD);

  // Always have the most up-to-date info on what is playing.
  const token = event.request.token || event.context.AudioPlayer.token;
  if (token) player.setAudioToken(token);

  const offset = event.context.AudioPlayer.offsetInMilliseconds || 0;
  player.setAudioOffset(offset);

  if (eventType === 'IntentRequest') {

    const intentMapping = {
      'PlayMusicIntent': async () => { await player.playTrack(event, callback) },
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
