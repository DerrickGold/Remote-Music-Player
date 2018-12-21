const httpRequest = require('./utils').httpRequest;
const JSONstringify = require('./utils').JSONstringify;

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

  errorResponse(handlerInput, submesg, error) {
    JSONstringify(error);
    return handlerInput.responseBuilder
      .speak(`I have encountered an error. ${submesg}: ${JSON.stringify(error)}`)
      .getResponse();
  }

  createPlayTrackHandler() {
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
        
        let errorResponse = null;
        if (artistInfo.value && !songInfo.value) {
          errorResponse = await self.filterArtist({ handlerInput, artist: artistInfo.value });
          
        } else if (artistInfo.value && songInfo.value) {
          errorResponse = await self.filterSongByArtist({ 
            handlerInput, 
            artist: artistInfo.value, 
            song: songInfo.value 
          });
        }
        if (errorResponse !== null) {
          console.log('error response?:', errorResponse);
          return errorResponse;
        }

        return self.getNextSong().then((songResponse) => {
          return self.playSong({ 
            token: songResponse.id, 
            handlerInput 
          });
        }).catch((error) => {
          return errorResponse(handlerInput, 'Error retrieving next song id', error);
        });
      }
    }
  }

  createResetPlaylistHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'ResetPlaylistIntent';
      },
      handle(handlerInput) {
        return self.resetPlaylist().then(() => {
          return self.getNextSong();
        }).then((songResponse) => {
          return self.playSong({ 
            token: songResponse.id,
            handlerInput 
          });
        });
      }
    }
  }

  createEnqueueHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'AudioPlayer.PlaybackNearlyFinished';
      },
      handle(handlerInput) {
        return self.getNextSong().then((songResponse) => {
          return self.playSong({ 
            token: songResponse.id,
            handlerInput, 
            playBehavior: 'ENQUEUE'
          });
        });
      }
    }
  }

  createNextHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.NextIntent';
      },
      handle(handlerInput) {
        return self.getNextSong().then((songResponse) => {
          return self.playSong({
            token: songResponse.id,
            handlerInput, 
          });
        });
      }
    }
  }

  createStopHandler() {
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent';
      },
      handle(handlerInput) {
        return handlerInput.responseBuilder
          .addAudioPlayerStopDirective()
          .getResponse();
      }
    }
  }

  createRestartHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StartOverIntent';
      },
      handle(handlerInput) {
        return self.playSong({
          token: self.getAudioToken(),
          handlerInput, 
        });
      }
    }
  }

  createPauseHandler() {
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.PauseIntent';
      },
      handle(handlerInput) {
        return handlerInput.responseBuilder
          .addAudioPlayerStopDirective()
          .getResponse();
      }
    }
  }

  createResumeHandler() {
    const self = this;
    return {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.ResumeIntent';
      },
      handle(handlerInput) {
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

  playSong({
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

  filterArtist({
    handlerInput,
    artist
  }) {
    const self = this;
    const payload = { artist };
    return this.postRequest('/alexa/artist', payload).then((resp) => {
      if (resp.playlist.length === 0) {
        return handlerInput.responseBuilder
        .speak(`I couldn't find any songs by ${artist}`)
        .getResponse();
      } else {
        console.log("this should return null");
        return null;
      }
    }).catch((error) => {
      return self.errorResponse(handlerInput, 'Error searching for artitst', error);
    });
  }

  filterSongByArtist({
    handlerInput,
    artist,
    song
  }) {
    const self = this;
    const payload = { artist, song };
    return this.postRequest('/alexa/artist/song', payload).then((resp) => {
      console.log('search response:', resp);
      if (resp.playlist.length === 0) {
        return handlerInput.responseBuilder
          .speak(`I couldn't find the song ${song} by ${artist}`)
          .getResponse();
      } else {
        return null;
      }
    }).catch((error) => {
      return self.errorResponse(handlerInput, 'Error searching for song by artist', error);
    });
  }

  getNextSong() {
    return this.getRequest('/alexa/random');
  }
  
  postRequest(path, data) {
    const self = this;
    const postData = Object.assign({}, data, {token: this.authToken });
    return httpRequest(this.serverUrl, this.port, path, 'POST', postData)
      .catch((resp) => {
        return self.handleAuthRequests('POST', resp, path, data);
      });
  }
  
  getRequest(path, data) {
    const self = this;
    const postData = Object.assign({}, data, { token: this.authToken });
    return httpRequest(this.serverUrl, this.port, path, 'GET', postData)
      .catch((resp) => {
        return self.handleAuthRequests('GET', resp, path, data)
      });
  }

  handleAuthRequests(method, response, path, data) {
    const self = this;
    if (response.status === 401) {
      return self.getAuthToken().then(() => {
        if (method === 'GET')
          return self.getRequest(path, data);
        else
          return self.postRequest(path, data);
      });
    }
  }

  setAuthToken(authResponse) {
    this.authToken =  authResponse.token;
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

  getAuthToken() {
    if (this.authToken === null) {
      return new Promise((resolve, reject) => {
        this.postRequest(
        '/authenticate',
        { 
          password: this.password 
        }).then((resp) => {
          this.setAuthToken(resp);
          resolve();
        }).catch((err) => {
          console.log(`Failed to authenticate: ${err}`);
          reject(err);
        });
      });
    }
  }
  
  resetPlaylist() {
    return this.getRequest('/alexa/resetplaylist');
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
