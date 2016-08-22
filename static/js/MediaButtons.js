MediaButtons = function(evtSys, mediaLibrary) {

    var that = this;
    this.mediaLibrary = mediaLibrary;
    this.currentState = null;
    this.evtSys = evtSys;
    
    var updatePlayPauseBtn = function(newState) {
	that.currentState = newState;
	
	var icon = document.getElementById("PlayPauseIcon");
	if (newState == PlayBackStates["PAUSED"] || newState == PlayBackStates["STOPPED"]) {
	    icon.classList.remove('glyphicon-pause');
	    icon.classList.add('glyphicon-play');
	} else {
	    icon.classList.remove('glyphicon-play');
	    icon.classList.add('glyphicon-pause');
	}

    }
    
    var playPauseBtn = document.getElementById("PlayPauseBtn");
    playPauseBtn.onclick = function() {
	if (that.currentState == PlayBackStates["PAUSED"] || that.currentState == PlayBackStates["STOPPED"]) {
	    that.mediaLibrary.unpauseSong();
	} else {
	    that.mediaLibrary.pauseSong();
	}	
    }

    var speakerBtn = document.getElementById("SpeakerBtn");
    speakerBtn.onclick = function() {
	that.mediaLibrary.swapOutput();
    }

    
    this.evtSys.addEventListener('media state change', function(state) {
	console.log("Media state changed! " + state);
    });

    this.evtSys.addEventListener('media state change', updatePlayPauseBtn);
}
