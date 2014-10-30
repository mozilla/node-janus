'use strict';

var StatsdClient = require('node-statsd').StatsD;
var CONFIG = require('config');
var os = require('os');
var cluster = require('cluster');
var http = require('http');
var memwatch = require('memwatch');

var forEach = require('./util').forEach;
var log = require('./log');

// Default sytem update interval in ms.
var UPDATE_INTERVAL = 10000;

// Return the current time.
function now() {
  return new Date();
}

// Return time difference in ms.
function durationSince(startTime) {
  return now().getTime() - startTime.getTime();
}

// Timer used to report time metrics.
var Timer = function(metrics, key, timeout) {
  this.metrics = metrics;
  this.key = key;
  this.timeout = Math.max(0, timeout || 0);
  this.duration = 0;
  this.clear();
};

// Reset and start the timer.
Timer.prototype.start = function() {
  var metrics = this.metrics;
  var timeout = this.timeout;
  var key = this.key;

  this.clear();
  this.startTime = now();

  if (timeout) {
    this._timeout = setTimeout(function() {
      metrics.count(key + '.timeout');
      log.warn('metrics timeout (%d) for %s', timeout, key);
    }, timeout);
  }

  return this;
};

// Resume a paused timer, do nothing if timer is active.
Timer.prototype.resume = function() {
  if (this.startTime === null) {
    this.startTime = now();
  }
  return this;
};

// Return the duration in ms.
Timer.prototype.getDuration = function() {
  var duration = this.duration;
  if (this.startTime) {
    duration += durationSince(this.startTime);
  }
  return duration;
};

// Pause timer, return the accumulated duration up to this point.
Timer.prototype.pause = function() {
  var accDuration = this.getDuration();
  this.clear();
  this.duration = accDuration;

  return accDuration;
};

// Stop and clear timer, report metric, return the duration in ms.
Timer.prototype.stop = function() {
  var duration = this.getDuration();
  this.metrics.timing(this.key, duration);
  this.clear();

  return duration;
};

// Stop tracking time and timeouts, don't report anything.
Timer.prototype.clear = function() {
  clearTimeout(this._timeout);
  this._timeout = null;
  this.startTime = null;
  this.duration = 0;
};

// Named metrics session used to auto-prepend name prefix to all keys.
var Session = function(metrics, name) {
  this.metrics = metrics;
  this.prefix = name + '.';
};

Session.prototype.key = function(key) {
  return this.prefix + key;
};

Session.prototype.count = function(key, delta) {
  return this.metrics.count(this.key(key), delta);
};

Session.prototype.gauge = function(key, value) {
  return this.metrics.gauge(this.key(key), value);
};

Session.prototype.set = function(key, value) {
  return this.metrics.set(this.key(key), value);
};

Session.prototype.timing = function(key, duration) {
  return this.metrics.timing(this.key(key), duration);
};

// Create metrics timer, autostarts by default.
Session.prototype.timer = function(key, timeout) {
  var timer = new Timer(this.metrics, this.key(key), timeout);
  timer.start();
  return timer;
};

// Create metrics timer for streams, autostarts by default.
Session.prototype.streamTimer = function(stream, key, timeout) {
  var session = this;
  var timer = session.timer(key, timeout);

  // Inject into read to measure delays.
  var readableTimer = session.timer(key + '.read.delay');
  readableTimer.pause();
  var streamRead = stream.read;
  var readSize = 0;

  if (streamRead) {
    stream.read = function() {
      var ret = streamRead.apply(this, arguments);

      if (ret === null) {
        // Track empty read buffer to "readable" delay.
        readableTimer.resume();
      } else {
        readSize += ret.length || 0;
      }
      return ret;
    };
  }

  // Inject into write to measure delays.
  var drainTimer = session.timer(key + '.write.delay');
  drainTimer.pause();
  var streamWrite = stream.write;
  var writeSize = 0;

  if (streamWrite) {
    stream.write = function(data) {
      // Track empty write buffer to write dleay.
      drainTimer.pause();

      writeSize += data.length || 0;

      return streamWrite.apply(this, arguments);
    };
  }

  stream.once('finish', function() {
    timer.stop();
    session.count(key + '.read.transfer', readSize);
    session.count(key + '.write.transfer', writeSize);
    session.count(key + '.finish');

    readableTimer.stop();
    drainTimer.stop();
  });

  stream.once('close', function() {
    timer.clear();
    session.count(key + '.close');

    readableTimer.clear();
    drainTimer.clear();
  });

  stream.once('error', function() {
    timer.clear();
    session.count(key + '.error');

    readableTimer.clear();
    drainTimer.clear();
  });

  stream.on('readable', function() {
    readableTimer.pause();
  });

  stream.on('drain', function() {
    drainTimer.resume();
  });

  return timer;
};

// Metrics engine, used to track times and counters.
var Metrics = function(options) {
  var metrics = this;
  metrics.options = options.metrics;
  metrics.clients = [];
  metrics.systemSession = metrics.session('system');

  if (!options.metrics.enabled) {
    return;
  }

  if (options.metrics.system && options.metrics.system.enabled) {
    // Activate general system metrics.
    var updateInterval = options.metrics.system.interval * 1000 ||
                          UPDATE_INTERVAL;
    setInterval(metrics.update.bind(metrics), updateInterval);
  }

  if (options.metrics.statsd && options.metrics.statsd.enabled) {
    // Create a StatsD client and connect to the service.
    var statsdClient = new StatsdClient({
      host: options.metrics.statsd.host,
      port: options.metrics.statsd.port,
      prefix: options.metrics.statsd.prefix + '.'
    });

    metrics.clients.push(statsdClient);
  }

  if (options.metrics.profile.leaks.enabled) {
    // Heuristics-based leak detection.
    memwatch.on('leak', function(info) {
      metrics.systemSession.count('heap.growth', info.growth);
      log.warn('memory leak detected: ' + JSON.stringify(info));
    });

    // Post-GC stats reporting.
    memwatch.on('stats', function(stats) {
      forEach(stats, function(value, key) {
        metrics.systemSession.count('heap.' + key, value);
      });
    });
  }

  // Extensive (and expensive) heap profiling stats.
  var heapDiff = null;
  if (options.metrics.profile.heap.enabled) {
    memwatch.on('stats', function() {
      if (heapDiff) {
        // Report heap diff stats.
        var stats = heapDiff.end();
        heapDiff = null;

        metrics.systemSession.count('heap.size', stats['size_bytes']);
        metrics.systemSession.count('heap.nodes.current', stats.nodes);
        metrics.systemSession.count('heap.nodes.freed',
                                    stats.change['freed_nodes']);
        metrics.systemSession.count('heap.nodes.allocated',
                                    stats.change.allocated);

        stats.change.details.forEach(function(elem) {
          metrics.systemSession.count('heap.details.' + elem.what + '.size',
                                      elem['size_bytes']);
          metrics.systemSession.count('heap.details.' + elem.what +
                                      '.nodes.allocated', elem['+']);
          metrics.systemSession.count('heap.details.' + elem.what +
                                      '.nodes.freed', elem['-']);
        });
      } else {
        // Initial heap snapshot.
        heapDiff = new memwatch.HeapDiff();
      }
    });
  }
};

// Return a new metrics session for given prefix name.
Metrics.prototype.session = function(name) {
  return new Session(this, name);
};

// Add middleware to handle metrics with following (optional) functions:
// {
//   counter: function(key, delta),
//   gauge: function(key, value),
//   set: function(key, value),
//   timing: function(key, duration)
// }
Metrics.prototype.use = function(client) {
  if (client) {
    // Attach user-provided middleware.
    this.clients.push(client);
  }

  return this;
};

// Detach the given middleware.
Metrics.prototype.detach = function(client) {
  var index = this.clients.indexOf(client);
  if (index >= 0) {
    this.clients.splice(index, 1);
  }

  return this;
};

// Update the system metrics.
Metrics.prototype.update = function() {
  var metrics = this;

  if (cluster.isMaster) {
    var numCpus = os.cpus().length;

    this.systemSession.gauge('cpu.num', numCpus);
    this.systemSession.gauge('cpu.load.avg', os.loadavg()[0]);
    this.systemSession.gauge('memory.total', os.totalmem());
    this.systemSession.gauge('memory.free', os.freemem());

    // Collect average CPU usage stats.
    var cpuStats = { speed: 0, user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
    os.cpus().forEach(function(cpu) {
      cpuStats.speed += cpu.speed;
      cpuStats.user += cpu.times.user;
      cpuStats.nice += cpu.times.nice;
      cpuStats.sys += cpu.times.sys;
      cpuStats.idle += cpu.times.idle;
      cpuStats.irq += cpu.times.irq;
    });

    forEach(cpuStats, function(stat, s) {
      stat /= numCpus;
      metrics.systemSession.gauge('cpu.' + s + '.avg', stat);
    });
  }

  function lengthSum(obj) {
    var s = 0;
    forEach(obj, function(e) {
      s += e.length;
    });
    return s;
  }

  // Report per-process HTTP stats.
  this.systemSession.count('sockets', lengthSum(http.globalAgent.sockets));
  this.systemSession.count('requests', lengthSum(http.globalAgent.requests));

  log.debug('reporting system metrics');
};

// Check whether we should log the specific metric.
Metrics.prototype.shouldLog = function(key) {
  if (!this.options.selection.enabled) {
    return true;
  }

  for (var i = 0; i < this.options.selection.set.length; ++i) {
    if (this.options.selection.set[i] === key) {
      return true;
    }
  }

  return false;
};

// Change the count value for given key by the given delta.
Metrics.prototype.count = function(key, delta) {
  if (!this.shouldLog(key)) {
    return;
  }

  if (delta === undefined) {
    delta = 1;
  }

  if (delta === 0) {
    return;
  }

  this.clients.forEach(function(client) {
    var counter = client.counter;
    if (!counter) {
      // Some clients separate increment and decrement counts.
      if (delta > 0) {
        counter = client.increment;
      } else {
        counter = client.decrement;
      }
    }

    if (counter) {
      counter.call(client, key, delta);
    }
  });
};

// Update the 'gauge' value for given key.
Metrics.prototype.gauge = function(key, value) {
  if (!this.shouldLog(key)) {
    return;
  }

  this.clients.forEach(function(client) {
    if (client.gauge) {
      client.gauge(key, value);
    }
  });
};

Metrics.prototype.set = function(key, value) {
  if (!this.shouldLog(key)) {
    return;
  }

  this.clients.forEach(function(client) {
    if (client.set) {
      client.set(key, value);
    }
  });
};

// Add a timing entry for given key with given duration.
Metrics.prototype.timing = function(key, duration) {
  if (!this.shouldLog(key)) {
    return;
  }

  this.clients.forEach(function(client) {
    if (client.timing) {
      client.timing(key, duration);
    }
  });
};

module.exports = new Metrics(CONFIG);
