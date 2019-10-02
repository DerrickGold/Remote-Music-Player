'use strict';
const Alexa = require('ask-sdk');

const JSONstringify = require('./utils').JSONstringify;
const RemoteMusicPlayer = require('./rmpclient');

const SEVER_URL = process.env.RMP_SERVER;
const SERVER_PORT = process.env.RMP_PORT;
const SERVER_PASSWD = process.env.RMP_PASSWORD;

let skill;

const myErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log("ERROR HANDLER");
    JSONstringify(error);
    return handlerInput.responseBuilder
      .speak(`I've encountered an error: ${error}`)
      .getResponse();
  }
};

exports.handler = async function (event, context, callback) {
  JSONstringify(event);
  const player = new RemoteMusicPlayer(SEVER_URL, SERVER_PORT, SERVER_PASSWD);

  const GetAudioPlayerDatatInterceptor = {
    process(handlerInput) {
      return new Promise(async (resolve) => {
        const {
          token,
          offsetInMilliseconds
        } = player.getAudioPlayerData(handlerInput);
        player.setAudioOffset(offsetInMilliseconds);
        player.setAudioToken(token);
        resolve();
      });
    }
  }

  if (!skill) {
    skill = Alexa.SkillBuilders.custom()
      .addRequestHandlers(
        player.createPlayTrackHandler(),
        player.createStopHandler(),
        player.createEnqueueHandler(),
        player.createPauseHandler(),
        player.createResumeHandler(),
        player.createResetPlaylistHandler(),
        player.createRestartHandler(),
        player.createNextHandler(),
        player.createNoResponseHandler('AudioPlayer.PlaybackFinished'),
        player.createNoResponseHandler('AudioPlayer.PlaybackStopped'),
        player.createNoResponseHandler('AudioPlayer.PlaybackStarted'),
      )
      .addRequestInterceptors(
        GetAudioPlayerDatatInterceptor,
      )
      .addErrorHandlers(
        myErrorHandler,
      )
      .create();
  }

  const response = await skill.invoke(event, context);
  JSONstringify(response);

  //return response;
  callback(null, response);
};
