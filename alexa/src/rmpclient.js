const httpRequest = require('./utils').httpRequest;
const JSONstringify = require('./utils').JSONstringify;
const speechResponse = require('./utils').speechResponse;


module.exports = class RemoteMusicPlayer {
  constructor(serverUrl, port, password) {
    this.password = password;
    this.port = port;
    this.authToken = null;
    this.serverUrl = serverUrl;
    this.bitrate = 320;
    this.currentAudioToken = null;
    this.pauseOffset = 0;
  }

  async createPlayTrackHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'PlayMusicIntent';
      },
      async handle(handlerInput) {
        const intentInfo = handlerInput.requestEnvelope.request.intent.slots;
        const artistInfo = intentInfo.artist;
        const songInfo = intentInfo.song;
        
        await self.getAuthToken();

        if (artistInfo.value && !songInfo.value) {
          const payload = { artist: artistInfo.value };
          
          const searchResponse = await self.postRequest('/alexa/artist', payload).then(async (resp) => {
            return JSON.parse(resp);
          });
          
          if (searchResponse.playlist.length === 0) {
            return handlerInput.responseBuilder
            .speak(`I couldn't find any songs by ${artistInfo.value}`)
            .getResponse();
          }
        } else if (artistInfo.value && songInfo.value) {
          const payload = { artist: artistInfo.value, song: songInfo.value };
          
          const searchResponse = await self.postRequest('/alexa/artist/song', payload).then(async (resp) => {
            JSONstringify(resp);
            return JSON.parse(resp);
          });
          console.log('search response:', searchResponse);
          
          if (searchResponse.playlist.length === 0) {
            console.log('This should exit!');
            return handlerInput.responseBuilder
            .speak(`I couldn't find the song ${songInfo.value} by ${artistInfo.value}`)
            .getResponse();
          }
        }

        const songResponse = await self.getNextSong();

        return self.playSong({ 
          token: songResponse.id, 
          handlerInput 
        });
      }
    }
  }

  async createResetPlaylistHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'ResetPlaylistIntent';
      },
      async handle(handlerInput) {
        await self.getAuthToken();
        await self.resetPlaylist();
        const songResponse = await self.getNextSong();
        return self.playSong({ 
          token: songResponse.id,
          handlerInput 
        });
      }
    }
  }

  async createEnqueueHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'AudioPlayer.PlaybackNearlyFinished';
      },
      async handle(handlerInput) {
        await self.getAuthToken();
        const songResponse = await self.getNextSong();
        return self.playSong({ 
          token: songResponse.id,
          handlerInput, 
          playBehavior: 'ENQUEUE'
        });
      }
    }
  }

  async createNextHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.NextIntent';
      },
      async handle(handlerInput) {
        await self.getAuthToken();
        const songResponse = await self.getNextSong();
        return self.playSong({
          token: songResponse.id,
          handlerInput, 
        });
      }
    }
  }

  async createStopHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent';
      },
      async handle(handlerInput) {
        return handlerInput.responseBuilder
          .addAudioPlayerStopDirective()
          .getResponse();
      }
    }
  }

  async createRestartHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StartOverIntent';
      },
      async handle(handlerInput) {
        return self.playSong({
          token: self.getAudioToken(),
          handlerInput, 
        });
      }
    }
  }

  async createPauseHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.PauseIntent';
      },
      async handle(handlerInput) {
        return handlerInput.responseBuilder
          .addAudioPlayerStopDirective()
          .getResponse();
      }
    }
  }

  async createResumeHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.ResumeIntent';
      },
      async handle(handlerInput) {
        return self.playSong({
          token: self.getAudioToken(),
          handlerInput, 
          offsetInMilliseconds: self.getAudioOffset()
        });
      }
    }
  }

  createPlaybackFinishedHandler() {
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'AudioPlayer.PlaybackFinished';
      },
      handle(handlerInput) {
        return handlerInput.responseBuilder
          .addAudioPlayerStopDirective()
          .getResponse();
      }
    }
  }

  createNoResponseHandler(eventType) {
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === eventType;
      },
      handle(handlerInput) {
        return handlerInput.responseBuilder
          .getResponse();
      }
    }
  }

  getAudioPlayerData(handlerInput) {
    const event = handlerInput.requestEnvelope;
    if (event.context.AudioPlayer) {
      return event.context.AudioPlayer;
    } else {
      return {
        token: event.request.token,
        offsetInMilliseconds: 0
      };
    }
  }

  async playSong({
    token,
    handlerInput, 
    playBehavior = 'REPLACE_ALL', 
    offsetInMilliseconds = 0
  }) {
    const url = this.getAudioURL(token);

    if (playBehavior === 'ENQUEUE') {
      const prevToken = this.getAudioToken();
      return handlerInput.responseBuilder
      .addAudioPlayerPlayDirective(playBehavior, url, token, offsetInMilliseconds, prevToken)
      .getResponse();
    } else {
      return handlerInput.responseBuilder
        .addAudioPlayerPlayDirective(playBehavior, url, token, offsetInMilliseconds)
        .getResponse();
    }
  }

  async getNextSong() {
    return this.getRequest('/alexa/random').then(async (serverResponse) => {
      return JSON.parse(serverResponse);
    });
  }
  
  postRequest(path, data) {
    const postData = Object.assign({}, data, {token: this.authToken });
    return httpRequest(this.serverUrl, this.port, path, 'POST', postData);
  }
  
  getRequest(path) {
    const postData = Object.assign({}, { token: this.authToken });
    return httpRequest(this.serverUrl, this.port, path, 'GET', postData);
  }

  setAuthToken(authResponse) {
    const parsed = JSON.parse(authResponse);
    this.authToken =  parsed.token;
  }

  getAudioURL(songId) {
    const setQuality = `quality=${this.bitrate}k`;
    const setToken = `token=${this.authToken}`;
    const serverUrl = `${this.serverUrl}:${this.port}`;
    
    return `https://${serverUrl}/api/files/${songId}/stream?${setQuality}&transcode=false&${setToken}`;
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

  async getAuthToken() {
    if (this.authToken === null) {
      return this.postRequest(
        '/authenticate',
        { 
          password: this.password 
        }).then((resp) => this.setAuthToken(resp)).catch((err) => {
          console.log(`Failed to authenticate: ${err}`);
        });
    }
  }
  
  async resetPlaylist() {
    await this.getAuthToken();
    await this.getRequest('/alexa/resetplaylist');
  }

  setSessionAttribute(handlerInput, attributes) {
    //const lastAttributes = this.getSessionAttributes(handlerInput);
    const newAttributes = Object.assign({}, attributes);
    handlerInput.attributesManager.setSessionAttributes(newAttributes);
  }

  getSessionAttributes(handlerInput) {
    return handlerInput.attributesManager.getSessionAttributes();
  }
}
