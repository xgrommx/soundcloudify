/*

        PLANGULAR
        A Highly Customizable SoundCloud Player

        Angular Version

        http://jxnblk.github.io/Plangular

 */

(function() {

'use strict';

var plangular = angular.module('plangular', []);

plangular.service('CorePlayer', function(Messaging, NowPlaying, CLIENT_ID, GATracker) {

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var context = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  }

  var DEFAULT_STATE = {
    currentTrack: false,
    currentIndex: 0,
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 0.5,
    repeat: 0,
    shuffle: false
  };

  var self = this;
  this.tracks = [];
  this.state = DEFAULT_STATE;

  NowPlaying.getList(function(tracks) {
    self.tracks = tracks;
  });

  NowPlaying.getState(function(savedState) {
    if (savedState && typeof savedState.volume !== 'undefined') {
      self.state = savedState;
    }
  });

  this.add = function(track, andPlay) {

    andPlay = andPlay || true;

    if (track) {
      //we need to do a copy here to ensure each track we add
      //to the playlist will have a unique id
      track = angular.copy(track);
      track.uuid = window.ServiceHelpers.ID();
      
      this.tracks.unshift(track);

      NowPlaying.saveList(this.tracks);
    }

    if (andPlay) {
      this.play(0);
    }

  };

  /**
   * Add track to position after the current index, in order to play this track  next
   */
  this.playNext = function(track) {
    
    if (track) {
      track = angular.copy(track);
      track.uuid = window.ServiceHelpers.ID();
      
      var currentIndex = this.state.currentIndex;
      this.tracks.splice(currentIndex + 1, 0, track);

      NowPlaying.saveList(this.tracks);
    }

  };

  /*
   * Clear the current list
   * Add all tracks to the list
   * Start play at position 0s
   */
  this.playAll = function(tracks) {

    this.tracks = tracks;
    NowPlaying.saveList(this.tracks);

    angular.extend(this.state, {
      currentTrack: false,
      currentIndex: 0,
      playing: false,
      currentTime: 0,
      duration: 0
    });

    this.play(0);
  };

  /**
   * Remove track at specific index
   */
  this.remove = function(index) {
    this.tracks.splice(index, 1);

    if (this.state.currentIndex === index) {
      this.play(index);
    } else if (index < this.state.currentIndex){
      this.state.currentIndex --;
    }

    NowPlaying.saveList(this.tracks);
    NowPlaying.saveState(this.state);
  };

  this.clear = function() {
    this.tracks = [];

    angular.extend(this.state, {
      currentTrack: null,
      currentIndex: 0,
      playing: false,
      currentTime: 0,
      duration: 0
    });

    Messaging.sendClearMessage();
    NowPlaying.saveList(this.tracks);
    NowPlaying.saveState(this.state);
  }

  this.play = function(index) {

    index = index || 0;

    var track = this.tracks[index];

    if (!track) {
      throw 'No track found for playing, index=' + index;
    }

    if (track) {
      this.state.playing = true;
      this.state.currentTime = 0;
      this.state.duration = 0;
      this.state.currentTrack = track;
      this.state.currentIndex = index;
      NowPlaying.saveState(this.state);
      Messaging.sendPlayMessage(track);
    }
  };

  this.pause = function() {
    this.state.playing = false;
    NowPlaying.saveState(this.state);
    Messaging.sendPauseMessage();
  };

  this.resume = function() {
    this.state.playing = true;
    NowPlaying.saveState(this.state);
    Messaging.sendResumeMessage();
  };

  this.stop = function() {
    this.state.playing = false;
    this.state.currentTime = 0;
    NowPlaying.saveState(this.state);
  };

  this.playPause = function(index) {
    if (typeof index !== 'undefined') {
      if (index === this.state.currentIndex) {
        this.state.playing ? this.pause() : this.resume();
      } else {
        this.play(index);
      }
      return;
    }

    this.state.playing ? this.pause() : this.resume();
  };

  this.next = function() {
    Messaging.sendNextMessage();
  };

  this.previous = function() {
    Messaging.sendPrevMessage();
  };

  this.seek = function(xpos) {
    this.state.currentTime = xpos * this.state.duration;
    Messaging.sendSeekMessage(xpos);
  };

  this.updateState = function(data) {
    if(!this.state.currentTrack) {
      this.state.currentTrack = data.track;
      this.state.playing = true;
    }

    this.state.currentTime = data.currentTime;
    this.state.duration = data.duration;
  };

  this.isPlaying = function(trackId) {
    if (!this.state.currentTrack) return false;
    return this.state.currentTrack.id === trackId;
  };

  var deboundSaveVolume = debounce(function() {
    NowPlaying.saveState(self.state);
  }, 500);

  this.setVolume = function(volume) {
    this.state.volume = volume;
    Messaging.sendVolumeMessage(volume);
    deboundSaveVolume();
  };

  this.toggleRepeat = function() {
    if (this.state.repeat === 0) {
      this.state.repeat = 1; // repeat all
    } else if (this.state.repeat === 1) {
      this.state.repeat = 2; // repeat one
    } else {
      this.state.repeat = 0; // no repeat
    }
    NowPlaying.saveState(this.state);
    GATracker.trackPlayer('toggle repeat', this.state.repeat === 1 ? 'all' : this.state.repeat === 2 ? 'one' : 'none');
  };

  this.toggleShuffle = function() {
    this.state.shuffle = !this.state.shuffle;
    NowPlaying.saveState(this.state);
    GATracker.trackPlayer('toggle shuffle', this.state.shuffle ? 'on' : 'off');
  };

  this.markCurrentTrackError = function() {
    this.state.currentTrack.error = true;
    this.tracks[this.state.currentIndex].error = true;
    NowPlaying.saveState(this.state);
    NowPlaying.saveList(this.tracks);
    GATracker.trackPlayer('track error');
  };
});

plangular.directive('plangular', ['$http', '$rootScope', 'plangularConfig', 'Messaging', 'CorePlayer', '$mdToast',
                                             function ($http, $rootScope, plangularConfig, Messaging, CorePlayer, $mdToast) {
  
  var CLIENT_ID = plangularConfig.clientId;

  return {

    restrict: 'A',
    scope: true,
    link: function (scope, elem, attrs) {

      scope.player = CorePlayer;

      Messaging.registerTimeUpdateHandler(function(data) {
        $rootScope.$apply(function () {
          CorePlayer.updateState.call(CorePlayer, data);
        });
      });
  
      Messaging.registerTrackChangedFromBackgroundHandler(function(data) {
        console.log('tack changed from background');
        scope.player.state = data;
      });

      Messaging.registerErrorHandler(function() {
        $mdToast.show({
          templateUrl: 'scripts/views/toastError.html',
          hideDelay: 1000,
          position: 'bottom right',
          parent: angular.element(document.querySelector('#tab-content'))
        });

        CorePlayer.markCurrentTrackError();
      });

      Messaging.registerEndedHandler(function() {
        CorePlayer.stop();
      });
    }

  }

}]);


// Plangular Icons
plangular.directive('plangularIcon', function() {

  var sprite = {
    play: 'M0 0 L32 16 L0 32 z',
    pause: 'M0 0 H12 V32 H0 z M20 0 H32 V32 H20 z',
    previous: 'M0 0 H4 V14 L32 0 V32 L4 18 V32 H0 z',
    next: 'M0 0 L28 14 V0 H32 V32 H28 V18 L0 32 z',
    close: 'M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z',
    chevronRight: 'M12 1 L26 16 L12 31 L8 27 L18 16 L8 5 z',
    chevronLeft: 'M20 1 L24 5 L14 16 L24 27 L20 31 L6 16 z',
    heart: 'M0 10 C0 6, 3 2, 8 2 C12 2, 15 5, 16 6 C17 5, 20 2, 24 2 C30 2, 32 6, 32 10 C32 18, 18 29, 16 30 C14 29, 0 18, 0 10'
  };

  return {

    restrict: 'A',
    scope: true,
    link: function (scope, elem, attrs) {

      var el = elem[0],
          id = attrs.plangularIcon,
          path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

      if (!sprite[id]) {
        var availableIcons = '';
        for (var key in sprite) {
          availableIcons += key + ', ';
        };
        console.error(
          'No icon found for ' + id + '.\n\n' +
          'Icons available:\n'+
          availableIcons + '\n\n' +
          'More icons available from http://jxnblk.github.io/geomicons-open'
        );
        return false;
      }

      el.classList.add('plangular-icon', 'plangular-icon-'+id);
      el.setAttribute('viewBox', '0 0 32 32');
      el.setAttribute('style', 'max-height:100%');
      el.setAttribute('fill', 'currentColor');
      path.setAttribute('d', sprite[id]);
      el.appendChild(path);
 
    }

  }

});


// Filter to convert milliseconds to hours, minutes, seconds
plangular.filter('prettyTime', function() {
  return function(value) {
    var hours = Math.floor(value / 3600),
        mins = '0' + Math.floor((value % 3600) / 60),
        secs = '0' + Math.floor((value % 60));
        mins = mins.substr(mins.length - 2);
        secs = secs.substr(secs.length - 2);
    if(!isNaN(secs)){
      if (hours){
        return hours+':'+mins+':'+secs;  
      } else {
        return mins+':'+secs;  
      };
    } else {
      return '00:00';
    };
  };
});

// Filter to convert milliseconds to hours, minutes, seconds
plangular.filter('scArtwork', function() {
  return function(value) {

    if (!value) return 'images/artwork-default.jpg';

    if (value.indexOf('-large') !== -1) {
      return value.replace('-large.', '-t250x250.');
    } else if (value.indexOf('default.jpg') !== -1) {
      return value.replace('default.jpg', 'hqdefault.jpg');
    }

    return value;
  };
});

plangular.provider('plangularConfig', function() {
  this.clientId = '849e84ac5f7843ce1cbc0e004ae4fb69';
  var _this = this;
  this.$get = function() {
    return {
      clientId: _this.clientId
    };
  };
});

plangular.factory("Messaging", function() {

  var onTimeUpdate, onEnded, onTrackChanged, onError;

  var port = chrome.runtime.connect({name: "soundcloudify"});

  port.onMessage.addListener(function(event) {
    var data = event.data;

    switch(event.message) {
      case 'scd.timeupdate':
        if(onTimeUpdate)
          onTimeUpdate(data);
        break;
      case 'scd.ended':
        if(onEnded)
          onEnded(data);
        break;
      case 'scd.trackChangedFromBackground':
        if(onTrackChanged)
          onTrackChanged(data);
        break;
      case 'scd.error':
        if(onError)
          onError();
        break;
    }
  });
    
  return {
      registerErrorHandler: registerErrorHandler,
      registerTimeUpdateHandler: registerTimeUpdateHandler,
      registerEndedHandler: registerEndedHandler,
      registerTrackChangedFromBackgroundHandler: registerTrackChangedFromBackgroundHandler,
      sendPlayMessage: sendPlayMessage,
      sendNextMessage: sendNextMessage,
      sendPrevMessage: sendPrevMessage,
      sendPauseMessage: sendPauseMessage,
      sendClearMessage: sendClearMessage,
      sendResumeMessage: sendResumeMessage,
      sendSeekMessage: sendSeekMessage,
      sendVolumeMessage: sendVolumeMessage
  };

  function registerErrorHandler(callback) {
    onError = callback;
  }

  function registerTimeUpdateHandler(callback) {
    onTimeUpdate = callback;
  }

  function registerEndedHandler(callback) {
    onEnded = callback;
  }

  function registerTrackChangedFromBackgroundHandler(callback) {
    onTrackChanged = callback;
  }

  function sendPlayMessage(track) {
    port.postMessage({message: 'scd.play', data: {
        track: track
    }});
  }

  function sendNextMessage() {
    port.postMessage({message: 'scd.next'});
  }

  function sendPrevMessage() {
    port.postMessage({message: 'scd.prev'}); 
  }

  function sendPauseMessage() {
    port.postMessage({message: 'scd.pause'});
  }

  function sendClearMessage() {
    port.postMessage({message: 'scd.clear'}); 
  }

  function sendResumeMessage() {
    port.postMessage({message: 'scd.resume'});
  }

  function sendSeekMessage(xpos) {
    port.postMessage({message: 'scd.seek', data: {
        xpos: xpos
    }});
  }
  function sendVolumeMessage(volume) {
    port.postMessage({message: 'scd.volume', data: {
        volume: volume
    }});
  }
});

})();


