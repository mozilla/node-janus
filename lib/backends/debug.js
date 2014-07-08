'use strict';

var util = require('util');
var sprintf = require('sprintf-js').sprintf;

function DebugBackend(startupTime, config, emitter) {
  var backend = this;
  this.lastFlush = startupTime;
  this.lastException = startupTime;

  emitter.on('flush', function(timestamp, metrics) {
    backend.flush(timestamp, metrics);
  });
}

DebugBackend.prototype.flush = function(timestamp, metrics) {
  var report = '';

  var elements = '';
  for (var count in metrics.counters) {
    if (metrics.counters.hasOwnProperty(count) && metrics.counters[count]) {
      elements += sprintf('\n%40s  %15d',  count, metrics.counters[count]);
    }
  }
  if (elements.length) {
    report += sprintf('\n\n%40s  %15s', 'counters', 'num') + elements;
  }

  elements = '';
  for (var timer in metrics.timer_data) {
    if (metrics.timer_data.hasOwnProperty(timer)) {
      elements += sprintf('\n%40s  %10d  %10.0f  %10.0f  %10.0f  %10.0f',
        timer, 
        metrics.timer_data[timer].count,
        metrics.timer_data[timer].sum,
        metrics.timer_data[timer].lower,
        metrics.timer_data[timer].median,
        metrics.timer_data[timer].upper);
    }
  }
  if (elements.length) {
    report += sprintf('\n\n%40s  %10s  %10s  %10s  %10s  %10s',
        'timers', 'num', 'sum', 'lower', 'median', 'upper') + elements;
  }

  if (report.length) {
    console.log('metrics report' + report);
  }
};

exports.init = function(startupTime, config, events) {
  return new DebugBackend(startupTime, config, events);
};
