'use strict';

require('chai').should();
var expect = require('chai').expect;

var metrics = require('../../lib/metrics');
var session = metrics.session('test');

var E = 10;
function approxEquals(a, b) {
  return (Math.abs(a - b) < E);
}

// Metrics middleware client used for metrics report verification.
var client = {
};
metrics.use(client);

module.exports = {
  'metrics': {
    before: function(done) {
      done();
    },

    'timer': {
      'basic': function(done) {
        var timer = session.timer('test');
        var timeout = 100;

        setTimeout(function() {
          var duration = timer.stop();
          expect(approxEquals(duration, timeout)).to.equal(true);
          done();
        }, timeout);
      },

      'pause': {
        'basic': function(done) {
          var timer = session.timer('test');
          timer.pause();
          var tries = 10;
          var timeout = 50;
          var expDuration = 0;

          // Alternate between timed and paused timeouts.
          function doit() {
            if (tries-- > 0) {
              setTimeout(function() {
                if (tries % 2) {
                  // Resume the timer for the next period.
                  timer.resume();
                  expDuration += timeout;
                } else {
                  // Stop the timer for the next period and check duration up
                  // to this point.
                  var duration = timer.pause();
                  expect(approxEquals(duration, expDuration)).to.equal(true);
                }

                // Initiate the next period.
                doit();
              }, timeout);
            } else {
              // We're done, verify the total duration.
              var duration = timer.stop();
              expect(approxEquals(duration, expDuration)).to.equal(true);
              done();
            }
          }

          doit();
        },
      },

      'timeout': {
        'good': function(done) {
          var numTimeouts = 0;
          client.counter = function(key, delta) {
            if (key === 'test.test.timeout') {
              numTimeouts += delta;
            }
          };

          var timerTimeout = 50;
          var timer = session.timer('test', timerTimeout);
          var timeout = 100;

          setTimeout(function() {
            var duration = timer.stop();
            expect(approxEquals(duration, timeout)).to.equal(true);
            expect(numTimeouts).to.equal(1);

            delete client.counter;
            done();
          }, timeout);
        },

        'long': function(done) {
          var numTimeouts = 0;
          client.counter = function(key, delta) {
            if (key === 'test.test.timeout') {
              numTimeouts += delta;
            }
          };

          var timerTimeout = 200;
          var timer = session.timer('test', timerTimeout);
          var timeout = 100;

          setTimeout(function() {
            var duration = timer.stop();
            expect(approxEquals(duration, timeout)).to.equal(true);
            expect(numTimeouts).to.equal(0);

            delete client.counter;
            done();
          }, timeout);
        },

        'bad': function(done) {
          var numTimeouts = 0;
          client.counter = function(key, delta) {
            if (key === 'test.test.timeout') {
              numTimeouts += delta;
            }
          };

          var timerTimeout = -100;
          var timer = session.timer('test', timerTimeout);
          var timeout = 200;

          setTimeout(function() {
            var duration = timer.stop();
            expect(approxEquals(duration, timeout)).to.equal(true);
            expect(numTimeouts).to.equal(0);

            delete client.counter;
            done();
          }, timeout);
        },
      }
    }
  }
};
