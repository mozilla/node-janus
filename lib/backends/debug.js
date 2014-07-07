'use strict';

var util = require('util');

function DebugBackend(startupTime, config, emitter) {
  var backend = this;
  this.lastFlush = startupTime;
  this.lastException = startupTime;

  emitter.on('flush', function(timestamp, metrics) {
    backend.flush(timestamp, metrics);
  });
}

DebugBackend.prototype.flush = function(timestamp, metrics) {
  var out = {
    counters: metrics.counters,
    // Do not log individual timers for readability.
    // timers: metrics.timers,
    gauges: metrics.gauges,
    timer_data: metrics.timer_data,
    counter_rates: metrics.counter_rates,
    sets: (function(vals) {
      var ret = {};
      for (var val in vals) {
        ret[val] = vals[val].values();
      }
      return ret;
    })(metrics.sets),
    pctThreshold: metrics.pctThreshold
  };

  console.log(util.inspect(out, false, null, true, true));
};

exports.init = function(startupTime, config, events) {
  return new DebugBackend(startupTime, config, events);
};
