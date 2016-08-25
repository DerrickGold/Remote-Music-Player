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

	if (!that.mediaLibrary.curTrackInfo) {
	    var track = that.mediaLibrary.getRandomTrack();
	    that.mediaLibrary.playSong(track, 0);
	    return;
	}
	
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


    var nextBtn = document.getElementById("NextBtn");
    nextBtn.onclick = function() {
	that.mediaLibrary.nextSong();
    }

    var prevBtn = document.getElementById("PrevBtn");
    prevBtn.onclick = function() {
	that.mediaLibrary.prevSong();
    }

    var shuffleBtn = document.getElementById("ShuffleBtn");
    shuffleBtn.onclick = function() {
	that.mediaLibrary.shuffle = !that.mediaLibrary.shuffle;

	if (that.mediaLibrary.shuffle) {
	    shuffleBtn.classList.remove('btn-default');
	    shuffleBtn.classList.add('btn-success');
	} else {
	    shuffleBtn.classList.remove('btn-success');
	    shuffleBtn.classList.add('btn-default');
	}
    }
    

    var searchBtn = document.getElementById("SearchBtn");
    searchBtn.onclick = function(e) {
	e.preventDefault();
	var searchKey = document.getElementById("SearchText").value;
	if (searchKey.length > 0)
	    that.mediaLibrary.showSearch(searchKey);
	else
	    that.mediaLibrary.clearSearch();
    }

    var clearSearchBtn = document.getElementById("ClearSearchBtn");
    clearSearchBtn.onclick = function(e) {
	e.preventDefault();
	var searchBox = document.getElementById("SearchText");
	searchBox.value = "";
	that.mediaLibrary.clearSearch();
    }
    
    this.evtSys.addEventListener('media state change', updatePlayPauseBtn);
}
