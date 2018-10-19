const PlayBackStates = {
  STOPPED: -1,
  PLAYING: 0,
  PAUSED: 1
}

class MusicLibrary{ 
  
  constructor(evtSys, doStreaming, autoplay, authtoken) {
    this.mediaDir = null;
    this.mediaHash = {};
    this.indentSize = 10;
    this.audioDiv = null;
    this.streaming = doStreaming;
    this.playbackState = PlayBackStates['STOPPED'];
    this.evtSys = evtSys;
    this.curTrackInfo = null;
    this.curTrackMetadata = {};
    this.curTimeOffset = 0;
    this.seekTimeTo = 0;
    this.curTrackLen = 0;
    this.isScrubbing = false;
    this.shuffle = false;
    this.playHist = [];
    this.navbarOffset = '';
    this.supportedFormats = null;
    this.curTimeDiv = null;
    this.scrubSlider = null;
    this.autoplay = autoplay;
    this.lastUpdate = 0;
    this.randomRecursDepth = 32;
    this.authtoken = authtoken;
    this.songEndTimeout = 0;

    this.getFiles();
  
    this.audioDiv = document.createElement('AUDIO');
    this.audioDiv.preload = 'off';
  
    this.curTimeDiv = document.getElementById('curinfo-time');
    this.scrubSlider = document.getElementById('scrubber'); 
    
    const self = this;
    this.audioDiv.ontimeupdate = function(e) {
      if (!self.isScrubbing) {
        if (self.curTrackLen > 0) {
          self.scrubSlider.style.width = (self.curTimeOffset * 100 / self.curTrackLen) + '%';
        } else {
          self.scrubSlider.style.width = 0;
        }

        if (self.seekTimeTo >= 0) {
          this.currentTime = self.seekTimeTo;
          self.seekTimeTo = -1;
        }
        self.curTimeDiv.innerHTML = self.secondsToMinutesStr(this.currentTime);
      }
      self.curTimeOffset = this.currentTime;
    }

    this.audioDiv.onerror = () => { this.nextSong(); }

    this.audioDiv.onended = () => {
      if (this.audioDiv.currentTime > 0) this.nextSong();
    }

    this.audioDiv.onseeking = () => { this.triggerLoading(); };
    this.audioDiv.onseeked = () => { this.triggerLoadingDone(); };
    document.body.appendChild(this.audioDiv);
    
    react('[role="open-location"]', 'click', (ev) => {
      ev.preventDefault();
      this.openFileDisplayToTrack(this.curTrackInfo);
      this.toggleNowPlaying(false, true);
    });
  
    this.apiCall('/api/commands/formats', 'GET', true, (resp) => {
      this.supportedFormats = JSON.parse(resp);
      const formats = document.getElementById('stream-format');
      this.supportedFormats['format'].forEach((fmt) => {
        const option = document.createElement('option');
        option.value = fmt;
        option.text = fmt;
        formats.appendChild(option);
      });
      formats.selectedIndex = 0;
      this.updateQualitySelect(this.supportedFormats['format'][0]);
      formats.onchange = (e) => {
        this.updateQualitySelect(e.target.value);
      }
    });
  
  
    document.getElementById('search-txt')
      .addEventListener('keypress', (e) => { e.stopPropagation(); });
  }

  appendTokenToUrl(url) {
    if (url.indexOf('?') > -1) url += '&token=' + this.authtoken;
    else url += '?token=' + this.authtoken;
    return url;
  }

  hashToEntry(hash) { return this.mediaHash[hash]; }
  
  triggerLoading() {
    this.evtSys.dispatchEvent(new Event('loading'));
  }

  triggerLoadingDone() {
    this.evtSys.dispatchEvent(new Event('loading done'));
  }

  triggerGotMetadata() {
    this.curTrackMetadata.cover = this.setCover(this.curTrackMetadata.cover);
    this.evtSys.dispatchEvent(new CustomEvent('retrieved metadata', {'detail': this.curTrackMetadata}));
  }

  triggerNewState() {
    const ev = new Event('media state change');
    ev.playbackState = this.playbackState;
    this.evtSys.dispatchEvent(ev);
  }

  encodeURI(uriIn) { return encodeURI(uriIn).replace(/\(/g, '%28').replace(/\)/g, '%29'); }

  getFolderCollapseId(directoryID) { return 'collapse-' + directoryID; }

  getFilePath(file) {
    let curFile = file;
    let output = file.name;
    while (curFile.parent != '.') {
      const parent = this.mediaHash[curFile.parent];
      if (parent.name === '.') break;
      output = parent.name + '/' + output;
      curFile = parent;
    }
    return this.mediaDir.root + '/' + output;
  }

  getRandomTrack(r_count) {
    if (r_count != undefined && r_count != null) {
      if (r_count >= this.randomRecursDepth) return null;
    } else r_count = 1;

    const allFiles = Object.keys(this.mediaHash);
    let index = -1;
    while (index < 0 || this.mediaHash[allFiles[index]].directory)
      index = Math.floor((Math.random() * 17435609119)) % allFiles.length;
  
    let curTrack = this.mediaHash[allFiles[index]];
    const nodes = this.reverseTrackHashLookup(curTrack).reverse();
    for (let i = 0; i < nodes.length; i++) {
      curTrack = this.mediaHash[nodes[i]];
      if (curTrack._exclude === true) return this.getRandomTrack(r_count + 1);
    }
    
    return curTrack;
  }

  getRootDirDiv() { return document.getElementById('dirlist'); }

  toggleNowPlaying(preventClose, forceClose) {
    const overlay = document.querySelector('[role="currently-playing"]');
    const content = document.querySelector('[role="content"]');
    const state = (forceClose || (!preventClose && !overlay.classList.contains('inactive')))
    overlay.classList.toggle('inactive', state);
    content.classList.toggle('inactive', !state);
  }

  getFiles() {
    this.triggerLoading();
    this._doneGet = false;
    this.apiCall('/api/files', 'GET', true, (resp) => {
      this.mediaDir = JSON.parse(resp);
      this.displayFolder(this.mediaDir.files, this.getRootDirDiv(), 0, this.mediaDir.count, (hash) => {
        this.triggerLoadingDone();
        if (this.autoplay) {
          //get the user to touch the screen to gain control of the audio player in mobile
          //browsers
          if (window.mobilecheck) {
            const msg = document.querySelector('[role="load-text"]');
            msg.classList.remove('hidden');
          }
          this.playSong(this.hashToEntry(this.autoplay), 0);
          this.toggleNowPlaying();
        }
      });
    });
  }

  rmNode(node) {
    if (!node) return;
  
    const parent = this.mediaHash[node.parent];
    if (node.directory) {
      node.children.forEach((e) => {
        this.rmNode(e)
      });
    }
    //update the parent node to remove the child entry
    for (let i = 0; i < parent.children.length; i++) {
      if (parent.children[i] === node.id) {
        parent.children.splice(i, 1);
        break;
      }
    }
    //remove the html element
    const nodeElm = document.getElementById(node.id);
    if (nodeElm) {
      nodeElm.parentNode.removeChild(nodeElm);
      console.log(nodeElm);
    }
    //remove element from the hash
    delete this.mediaHash[node.id];
  }
  
  nodeComparator(node1, node2) {
    if (node1.directory && !node2.directory) return -1;
    else if (!node1.directory && node2.directory) return 1;
  
    const name1 = node1.name.toLowerCase();
    const name2 = node2.name.toLowerCase();
    return name1.localeCompare(node2.name);
  }

  getInsertPos(parentNode, insertNode) {
    const targetHead = this.mediaHash[parentNode.id];

    let min = 0;
    let max = targetHead.children.length - 1;
    let mid = 0;
    let order = 0;

    while (min <= max) {
      mid = parseInt((min + max) / 2);
      order = this.nodeComparator(insertNode, targetHead.children[mid]);
      if (order < 0) max = mid - 1;
      else if (order > 0) min = mid + 1;
      else break;
    }

    if (mid >= targetHead.children.length - 1) {
      return {node: null, pos: targetHead.children.length -1, o: order};
    }
    mid += (this.nodeComparator(insertNode, targetHead.children[mid]) > 0);
    return {node: targetHead.children[mid], pos: mid, o: order};
  }
  
  insertTree(dest, node, top) {
    let newTop = top;
    let pDiv = null;
    let parentDiv = null;

    if (dest.parent === '.')
      parentDiv = document.querySelector('[role="tablist"]');
    else
      parentDiv = document.getElementById(this.getFolderCollapseId(dest.id));
      
    if (node.directory) {
      if (!this.mediaHash[node.id]) {
        this.mediaHash[node.id] = node;
        
        const newDir = this.displayMakeFolder(node, false, 0);
        if (!newTop) {
          const after = this.getInsertPos(dest, node);

          //we are taking our new tree and merging it with
          //the current file tree. Need to make sure its inserted
          //in sorted order
          newTop = true;
          pDiv = (after.node) ? document.getElementById(after.node.id) : null;
          dest.children.splice(after.pos, 0, node);
          parentDiv.insertBefore(newDir[0], pDiv);
        } else {
          //here we are just creating the html for the children nodes of the tree
          //we inserted, they should already be in sorted order from the tree diff
          parentDiv.appendChild(newDir[0]);
        }
      }    
      for (let i = 0; i < node.children.length; i++) {
        this.insertTree(this.mediaHash[node.id], node.children[i], newTop);
      }
    } else {
      if (this.mediaHash[node.id]) return;
      //not a directory, but a file
      //TODO: cleanup this ugly implementation, I just wanna listen to some tunes now
      const after = this.getInsertPos(dest, node);
      pDiv = (after.node) ? document.getElementById(after.node.id) : null;
      this.mediaHash[node.id] = node;
      parentDiv.insertBefore(this.displayMakeFile(node, 0), pDiv);
    }
  }

  rescanFiles() {
    const arg = this.lastUpdate !== null ? '?lastUpdate=' + this.lastUpdate : '';
    this.apiCall('/api/commands/rescan' + arg , 'GET', true, (resp) => {
      const mediaDiff = JSON.parse(resp);

      this.lastUpdate = mediaDiff.time;
      //remove files first, then add them
      for (let i = 0; i < mediaDiff['removed'].length; i++) {
        const id = mediaDiff['removed'][i];
        this.rmNode(this.mediaHash[id]);
      }
      const dest = this.mediaHash[mediaDiff['added'].id];
      this.insertTree(dest, mediaDiff['added'], false);
      if (mediaDiff['more'] === true) this.rescanFiles();
    });
  }
  
  getTrackPos(doneCb) {
    if (this.streaming) return;
    this.apiCall('/api/commands/info', 'POST', true, (resp) => {
      const data = JSON.parse(resp);
      this.curTimeOffset = data.pos;
      if (doneCb) doneCb(data);
    });
  }

  getPlaybackState() { return this.playbackState; }

  setFolderView(node, view) {
    const toggler = node.querySelector('[role="button"]');
    const collapser = node.querySelector('[role="tabpanel"]');
    const state = view === 'open' ? true : false;

    toggler.setAttribute('aria-expanded', state);
    collapser.setAttribute('aria-expanded', state);
    collapser.classList.toggle('collapse', !state)
    if (state) collapser.style.height = null;
  }
  
  makeMediaLibHash(root) {
    this.mediaHash[root.id] = root;
    if (!root.directory) return
    this.chunking(root.children, (e) => {
      this.makeMediaLibHash(e)
    });
  }

  secondsToMinutesStr(time) {
    const timeInt = parseInt(time);
    const minutes = Math.floor(timeInt / 60);
    const seconds = timeInt % 60;

    let result = '' + minutes + ':';
    if (seconds < 10) result += '0';
    result += seconds;
    return result
  }

  apiCall(route, method, async, successCb, errorCb) {
    const xhttp = new XMLHttpRequest();

    xhttp.onreadystatechange = () => {
      if (xhttp.readyState == 4 && xhttp.status == 200)
        if (successCb) successCb(xhttp.responseText);
      else if (xhttp.readyState == 4)
        if (errorCb) errorCb(xhttp.responseText);
    }

    route = this.appendTokenToUrl(route);
    xhttp.open(method, route, async);
    xhttp.send();
  }

  reverseTrackHashLookup(startNode) {
    const findStack = [];
    let curNode = startNode;

    if (!curNode) return [];
    while(curNode.parent != '.') {
      findStack.push(curNode.id);
      curNode = this.mediaHash[curNode.parent]
    }
    findStack.push(curNode.id);
    return findStack;
  }

  closeDirectory(folderDiv) {
    if (folderDiv.classList && folderDiv.getAttribute('role') === 'directory') {
      return this.closeDirectory(folderDiv.parentNode);
    }

    const x = folderDiv.querySelectorAll('[role="directory"]');
    for (let i = 0; i < x.length; i++) {
      x[i].classList.remove('hidden');
      this.setFolderView(x[i], 'close');
    }
  }

  displayMakeExcludeButton(nodeID, container) {
    const icon = document.createElement('span');

    icon.className = 'fa fa-ban exclude-btn';
    icon.setAttribute('aria-hidden', 'true');

    icon.onclick = (e) => {
      e.preventDefault();
      const aElm = container.querySelector('[role="button"]');
      const state = !this.mediaHash[nodeID]._exclude

      this.mediaHash[nodeID]._exclude = state;
      aElm.classList.toggle('disabled-folder', state);
      if (state) this.closeDirectory(container.parentNode);
    }
    return icon;
  }

  displayMakeFolder(folderEntry, expanded, depth) {
    const panelHeader = document.createElement('div');
    panelHeader.className = 'folder-heading';
    panelHeader.setAttribute('role', 'tab');
    panelHeader.appendChild(this.displayMakeExcludeButton(folderEntry.id, panelHeader));
  
    const icon = document.createElement('span');
    icon.className = 'fa fa-folder-o';
    icon.setAttribute('aria-hidden', 'true');
    panelHeader.appendChild(icon);
  
    const collapseButton = document.createElement('span');
    collapseButton.className = 'folder-entry-name';
    collapseButton.setAttribute('role', 'button');
    collapseButton.setAttribute('data-toggle', 'collapse');
    collapseButton.setAttribute('href','#' + this.getFolderCollapseId(folderEntry.id));
    collapseButton.setAttribute('aria-expanded', expanded);
    collapseButton.setAttribute('aria-controls', this.getFolderCollapseId(folderEntry.id));
    collapseButton.appendChild(document.createTextNode(folderEntry.name));
    panelHeader.appendChild(collapseButton);
  
    const panel = document.createElement('div');
    panel.id = folderEntry.id;
    panel.className = 'folder-entry unselectable';
    panel.setAttribute('role', 'directory');
    panel.appendChild(panelHeader);
  
    const bodyCollapse = document.createElement('div');
    bodyCollapse.id = this.getFolderCollapseId(folderEntry.id);
    bodyCollapse.className = 'panel-collapse collapse folder-body';
    bodyCollapse.setAttribute('role', 'tabpanel');
    panel.appendChild(bodyCollapse);
  
    collapseButton.onclick = (e) => {
      bodyCollapse.classList.toggle('collapse');
    };
  
    return [panel, bodyCollapse];
  }

  displayMakeFile(fileEntry, depth) {
    const text= document.createElement('div');
    text.id = fileEntry.id;
    text.className = 'file-entry folder-heading file-entry-name unselectable';
    text.setAttribute('role', 'button audio-file');
    text.appendChild(document.createTextNode(fileEntry.name));

    text.onclick = (e) => {
      e.preventDefault();
      this.audioDiv.play();
      this.playSong(fileEntry, 0);
    }
    return text;
  }

  displayFolder(folder, parentDiv, depth, count, donecb) {
    if (depth == 0) {
      this._processed = 0;
    }

    this.mediaHash[folder.id] = folder;
    this.chunking(folder.children, (f) => {
      this._processed++;
      if (f.directory) {
        const newDir = this.displayMakeFolder(f, false, depth);
        parentDiv.appendChild(newDir[0]);
        this.displayFolder(f, newDir[1], depth + 1, count, donecb);
      } else {
        this.mediaHash[f.id] = f;
        parentDiv.appendChild(this.displayMakeFile(f, depth));
      }
    }, () => {
      if (this._processed >= count - 1 && donecb) {
        this._processed = -1;
        donecb(this.mediaHash);
      }
    });
  }

  openFileDisplayToTrack(track) {
    if (track === undefined) {
      track = this.curTrackInfo;
    }
    //first check if item is not already in viewport before scrolling
    const trackDiv = document.getElementById(track.id);
    let inView = false;

    if (trackDiv) {
      const trackDivBox = trackDiv.getBoundingClientRect();
      inView = (trackDivBox.top >= 0 && trackDivBox.left >= 0 &&
                trackDivBox.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                trackDivBox.right <= (window.innerWidth || document.documentElement.clientWidth));
      //check if folder is open too
      const trackFolder = document.getElementById(this.getFolderCollapseId(track.parent));
      if (trackFolder) {
        inView = (inView && trackFolder.classList.contains('in'));
      }
    }

    const nodes = this.reverseTrackHashLookup(track).reverse();
    let lastDiv = null;
    this.chunking(nodes, (curNode) => {
      const id = curNode;

      if (this.mediaHash[id].parent == '.') return;
      if (this.mediaHash[id].directory) {
        lastDiv = document.getElementById(id);
        if (!lastDiv) return;
        this.setFolderView(lastDiv, 'open');
      } else
        lastDiv = document.getElementById(id);
    }, () => {
      if (inView || !lastDiv) return;
      lastDiv.scrollIntoView(true);
      window.scrollBy(0, -this.navbarOffset);
    });
  }

  chunking(library, cb, donecb) {
    const perFrame = 500;
    const lib = library;
    const fps = 60;
    const time = 1000/fps;

    let idx = 0;
    const doChunk = () => {
      setTimeout(() => {
        const liblen = lib.length;

        if (idx >= liblen) {
          if (donecb) donecb();
          return;
        }
        for (let x = 0; x < perFrame; x++) {
          if (idx + x >= liblen) break;
          if (cb) cb(lib[idx + x]);
        }
        idx += perFrame;
        window.requestAnimationFrame(doChunk);
      }, time);
    }
    window.requestAnimationFrame(doChunk);
  }

  showSearch(keyword) {
    let keywordFormatted = keyword.replace(/^s+|\s+$/g, '');
    keywordFormatted = this.encodeURI(keywordFormatted)

    if (keywordFormatted.length <= 0) {
      return;
    }

    this.toggleNowPlaying(false, true);
    this.triggerLoading();
    this.apiCall('/api/files/search/' + keywordFormatted, 'GET', true, (resp) => {
      const data = JSON.parse(resp);
      const everything = document.querySelectorAll('[role*="audio-file"],[role="directory"]');
      this.chunking(everything, (d) => {
        const id = d.id;
        if (id in data) {
          if (d.classList.contains('hidden')) d.classList.remove('hidden');
          if (d.getAttribute('role') === 'directory') return;
          else {
            const nodes = this.reverseTrackHashLookup(this.mediaHash[id]);
            let skipEntry = false;
            const checkExcluded = nodes.slice(0).reverse();
            while (checkExcluded.length > 0) {
              const id = checkExcluded.pop();
              if (this.mediaHash[id]._exclude) {
                skipEntry = true;
                delete data[id];
                break;
              }
            }

            if (skipEntry) {
              return;
            }

            while(nodes.length > 0) {
              const nodeID = nodes.pop();
              const hash = this.mediaHash[nodeID];
              if (hash.parent == '.') continue;
              data[nodeID] = 1;
              const div = document.getElementById(nodeID);
              if (hash.directory) this.setFolderView(div, 'open');
              div.classList.remove('hidden');
            }
          }
        } else if (!d.classList.contains('hidden'))
          d.classList.add('hidden');
      }, () => {
        this.triggerLoadingDone();
      });
    }, (resp) => {
      this.triggerLoadingDone();
    });
  }

  showFiles(show, donecb) {
    const apply = (el) => {
      el.classList.toggle('hidden', !show);
    }
    const x = document.querySelectorAll('[role*="audio-file"],[role="directory"]');
    this.chunking(Array.prototype.slice.call(x), apply, donecb);
  }

  clearSearch(keyword) { this.showFiles(true); }
  
  stopSong() {
    if (!this.streaming) {
      this.apiCall('/api/commands/stop', 'POST', true, (resp) => {
        this.playbackState = PlayBackStates['STOPPED'];
        this.triggerNewState();
      });
    } else {
      this.audioDiv.pause();
    }
  }

  updatePlayingEntry(entry, isPlaying) {
    if (!entry) {
      return;
    }

    const song = document.getElementById(entry.id);
    song.classList.toggle('playing-entry', isPlaying);

    if (!isPlaying) {
      const shareBtn = song.querySelector('[role="share"]');
      if (shareBtn) song.removeChild(shareBtn);

      const urlBox = song.querySelector('[role="share-url"]');
      if (urlBox) song.removeChild(urlBox);
    } else {
      const shareBtn = document.createElement('a');
      shareBtn.innerHTML = 'share';
      shareBtn.setAttribute('href', '#');
      shareBtn.setAttribute('role', 'share');

      const urlBox = document.createElement('p');
      urlBox.setAttribute('role', 'share-url');
      urlBox.innerHTML = window.location.href.match('.+/')
        + 'gui?stream=true&autoplay=' + entry.id;

      shareBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (urlBox) CopyToClipboard(urlBox);
      };

      song.appendChild(shareBtn);
      if (urlBox) song.appendChild(urlBox);
    }
  }

  playSong(songEntry, offset) {
    if (songEntry === null || songEntry === undefined) {
      alert('No available songs in play list to play!');
      return;
    }
    this.songEndTimeout = 0;
    this.curTrackLen = 0;
    this.seekTimeTo = -1;
    this.triggerLoading();
    if (this.curTrackInfo) this.playHist.push(this.curTrackInfo);
    this.updatePlayingEntry(this.curTrackInfo, false);
    this.curTrackInfo = songEntry;
    this.updatePlayingEntry(this.curTrackInfo, true);


    if (!this.streaming) {
      let url = '/api/files/' + songEntry.id + '/play';
      if (offset >= 0) url += '?offset=' + offset;

      this.apiCall(url, 'GET', true, (resp) => {
        this.playbackState = PlayBackStates['PLAYING'];
        this.triggerNewState();
        this.updateTrackInfo();
        this.triggerLoadingDone();
      });
    } else {
      //if we are streaming, get audio file path to add to local web player
      this.apiCall('/api/files/' + songEntry.id, 'GET', true, (resp) => {
        const trackData = JSON.parse(resp);

        const streamFormat = document.getElementById('stream-format');
        const fmt = streamFormat.options[streamFormat.selectedIndex].value;

        const streamOptions = document.getElementById('stream-quality');
        const quality = streamOptions.options[streamOptions.selectedIndex].value;

        const transcodeOptions = document.getElementById('transcoding-option');
        const transcode = transcodeOptions.options[transcodeOptions.selectedIndex].value;

        const srcURL = 'api/files/' + trackData.id + '/stream?format=' + fmt +
            '&quality=' + quality + '&transcode=' + transcode;
        
        const signedSrc = this.appendTokenToUrl(srcURL);

        this.audioDiv.src = this.encodeURI(signedSrc);
        this.audioDiv.play();
        const seekHandler = (audio) => {
          this.audioDiv.removeEventListener('canplay', seekHandler);
          if (offset > 0) audio.target.currentTime = offset;
          this.triggerLoadingDone();
        }

        this.audioDiv.addEventListener('canplay', seekHandler);
        this.playbackState = PlayBackStates['PLAYING'];
        this.triggerNewState();
        this.updateTrackInfo();
      }, () => {
        this.nextSong();
      });
    }
  }

  pauseSong() {
    if (!this.streaming) {
      this.apiCall('/api/commands/pause', 'POST', true, (resp) => {
        this.playbackState = PlayBackStates['PAUSED'];
        this.triggerNewState()
      });
    } else {
      this.audioDiv.pause();
      this.playbackState = PlayBackStates['PAUSED'];
      this.triggerNewState()
    }
  }

  unpauseSong() {
    if (!this.streaming) {
      this.apiCall('/api/commands/pause', 'POST', true, (resp) => {
        this.playbackState = PlayBackStates['PLAYING'];
        this.triggerNewState()
      });
      return
    }
    this.audioDiv.play();
    this.playbackState = PlayBackStates['PLAYING'];
    this.triggerNewState()
  }

  nextSong() {
    if (this.shuffle) {
      this.playSong(this.getRandomTrack(), 0);
      return;
    }
    
    if (!this.curTrackInfo) {
      return;
    }

    const nodes = this.reverseTrackHashLookup(this.curTrackInfo).reverse();

    let lastDir = this.curTrackInfo.id;
    while (nodes.length > 0) {
      const popped = nodes.pop();
      const directory = this.mediaHash[popped];

      //if we popped off the current track, ignore it for now
      if (!directory.directory) continue;
      //look for the last directory or file visited to get position in directory
      //to coninue from
      let found = false;
      let position = 0;

      for(; position < directory.children.length; position++) {
        if (directory.children[position].id === lastDir) {
          found = true;
          break;
        }
      }

      if (found) {
        position++;
      } else {
        position = 0;
      }

      while (position < directory.children.length && directory.children[position]._exclude) {
        position++;
      }
  
      //if we hit the end of the folder, continue up the next level
      if (position >= directory.children.length) {
        lastDir = directory.id;
        continue;
      }

      let nextTrack = directory.children[position];
      while (nextTrack.directory) nextTrack = nextTrack.children[0];
      //otherwise, play the next song
      this.playSong(nextTrack, 0);
      break;
    }
  }

  prevSong() {
    if (this.playHist.length < 1) {
      return;
    }
    //purge the current song content since the next song
    //after the previous will be randomly selected
    this.updatePlayingEntry(this.curTrackInfo, false);
    this.curTrackInfo = null;
    const lastTrack = this.playHist.pop();
    this.playSong(lastTrack, 0);
  }

  setCover(uri) {
    const doit = () => {
      effect('[role="album-cover"]', function (el) {
        el.src = uri;
      });
      effect('[role="background-cover"]', function (el) {
        el.style.backgroundImage = fallback ? null : 'url(' + uri + ')';
      });
      effect('[rel="shortcut icon"]', function (el) {
        el.href = uri;
      });
    }

    let fallback = uri ? false : true;
    if (fallback) {
      uri = 'static/img/default_album_art.png';
      fallback = false;
      doit()
    } else {
      uri = uri + '?' + Math.floor(Math.random() * 10000000) + 1;
      const preload = new Image();
      preload.src = uri
      preload.onload = doit()
    }

    return uri;
  }

  getExternalCover(metadata) {
    //look for and use a cover image that resides in the same
    //directory as the current track that is playing
    metadata.cover = null;
    const folderParent = this.mediaHash[this.curTrackInfo.parent];

    if (!('covers' in folderParent)) {
      this.triggerGotMetadata();
      return;
    }
    
    let useCover = null;
    folderParent['covers'].forEach((c) => {
      const str = c.toLowerCase();
      if (str.includes('front') || str.includes('cover') || str.includes('folder')) useCover = c;
    });
    if (!useCover) useCover = folderParent['covers'][0];
      
    this.apiCall('/api/files/'+ this.curTrackInfo.id + '/cover/' + useCover, 'GET', true, (resp) => {
      const data = JSON.parse(resp);
      //const cover = document.querySelector('[role='album-art']');
      if (!data.code) metadata.cover = data.path;
      this.triggerGotMetadata();
    }, () => {
      this.triggerGotMetadata();
    });
  }

  getEmbeddedCover(metadata) {
    //attempt to get a cover image that is embedded in the current audio file playing
    this.apiCall('/api/files/'+ this.curTrackInfo.id + '/cover', 'GET', true, (resp) => {
      const data = JSON.parse(resp);
      //var cover = document.querySelector('[role='album-art']');
      if (!data.code) {
        metadata.cover = data.path;
        this.triggerGotMetadata();
      }
      else this.getExternalCover(metadata);
    }, () => {
      this.getExternalCover(metadata);
    });
  }

  updateTrackInfo() {
    document.getElementById('curinfo-path').innerHTML = this.getFilePath(this.curTrackInfo);

    this.apiCall('/api/files/'+ this.curTrackInfo.id + '/data', 'GET', true, (resp) => {
      const data = JSON.parse(resp);
      const title = data.title.length > 0 ? data.title : this.curTrackInfo.name;
      let infoStr = '';
      
  
      this.curTrackLen = data['length'];
      this.curTrackMetadata = data;
      document.getElementById('curinfo-track').innerHTML = title;
      document.title = title;

      infoStr  = data.artist ? data.artist : '';
      infoStr += data.album ? (infoStr ? ' &mdash; ' + data.album : data.album) : '';

      document.getElementById('curinfo-artist').innerHTML = infoStr;
      document.getElementById('curinfo-totaltime').innerHTML = this.secondsToMinutesStr(this.curTrackLen);

      this.getEmbeddedCover(data);
    });
  }

  updateQualitySelect(val) {
    const qualityList = document.getElementById('stream-quality');
    //clear options first
    while (qualityList.firstChild) qualityList.removeChild(qualityList.firstChild);
    this.supportedFormats.quality[val].forEach((q) => {
      const option = document.createElement('option');

      option.value = q;
      option.text = q;
      qualityList.appendChild(option);
    });
    qualityList.selectedIndex = this.supportedFormats.quality[val].length - 1;
  }

  mouseDivOffset(el, mouseevent) {
    const style = window.getComputedStyle(el),
          width = style.getPropertyValue('width'),
          height = style.getPropertyValue('height'),
          box = el.getBoundingClientRect(),
          scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop,
          scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft,
          clientTop  = document.documentElement.clientTop || document.body.clientTop || 0,
          clientLeft = document.documentElement.clientLeft || document.body.clientLeft || 0,
          divYLoc = box.top + scrollTop - clientTop,
          divXLoc = box.left + scrollLeft - clientLeft;

    return [mouseevent.clientX - divXLoc, width, mouseevent.clientY - divYLoc, height];
  }

  scrubStart() { this.isScrubbing = true; }

  scrubEnd() { this.isScrubbing = false; }

  scrub(scrubbox, mouseevent) {
    const offsets = this.mouseDivOffset(scrubbox, mouseevent);
    if (offsets[0] < 0) {
      return;
    }

    const xoffset = parseFloat((parseInt(offsets[0]) * 100)/parseInt(offsets[1])).toFixed(0);
    this.scrubSlider.style.width = xoffset + '%';
    this.seekTimeTo = parseFloat((parseInt(offsets[0]))/parseInt(offsets[1]) * parseFloat(this.curTrackLen));
    this.curTimeDiv.innerHTML = this.secondsToMinutesStr(this.seekTimeTo);
  }
}