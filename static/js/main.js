var Media, MediaControls;

document.addEventListener("DOMContentLoaded", function() {
  var loadingScreen = document.querySelector('[role="load-screen"]');
  var reactor = constructEmitter({});
  reactor.addEventListener("loading", function(e) {
    loadingScreen.classList.add("visible");
  });
  reactor.addEventListener("loading done", function() {
    loadingScreen.classList.remove("visible");
  });
  
  Media         = new MusicLibrary(reactor, true);
  MediaControls = new MediaButtons(reactor, Media);

  reaction('[role="open-settings"]', 'click', '[role="settings"]', 
  function (ev, target, reactor) {
    ev.stopPropagation();
    reactor.classList.toggle('inactive');
  });
});

function react (target, ev, fn) {
  var targets = document.querySelectorAll(target);
  for (var n = 0; n < targets.length; n++) {
    targets[n].addEventListener(ev, fn);
  }
}

function effect (target, fn) {
  var targets = document.querySelectorAll(target);
  for (var n = 0; n < targets.length; n++) {
    fn(targets[n]);
  }
}

function reaction (target, ev, reactor, fn) {
  var targets = document.querySelectorAll(target);
  for (var n = 0; n < targets.length; n++) {
    var target = targets[n];
    target.addEventListener(ev, function (e) {
      var els = document.querySelectorAll(reactor);
      for (var i = 0; i < els.length; i++) {
        fn(e, target, els[i]); 
      };
    })
  }
}

function constructEmitter (obj) {
  var target = document.createDocumentFragment();
  ['addEventListener', 'dispatchEvent', 'removeEventListener']
  .forEach(function(method) {
    obj[method] = target[method].bind(target)
  })
  return obj
}
