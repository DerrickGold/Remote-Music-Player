var Media, MediaControls;
var params = queryStringToObject(location.search);


document.addEventListener("DOMContentLoaded", function() {
  var loadingScreen = document.querySelector('[role="load-screen"]');
  var reactor = constructEmitter({});
  reactor.addEventListener("loading", function(e) {
    loadingScreen.classList.add("visible");
  });
  reactor.addEventListener("loading done", function() {
    loadingScreen.classList.remove("visible");
  });

  Media         = new MusicLibrary(reactor, !!params.stream, params.autoplay);
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

function queryStringToObject (str) {
  var obj = {}
  if (!str) return obj
  if (str[0] == "?") str = str.substr(1)
  var arr = str.split("&")
  arr.forEach(function (el) {
    var a = el.split("=")
    obj[decodeURIComponent(a[0])] = decodeURIComponent(a[1])
  })
  return obj
}
