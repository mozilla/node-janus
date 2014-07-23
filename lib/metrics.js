'use strict';

var StatsdClient = require('statsd-client');
var CONFIG = require('config');
var os = require('os');
var cluster = require('cluster');
var http = require('http');

var forEach = require('./util').forEach;
var log = require('./log');

// Timer metric timeout in ms.
var TIMEOUT = exports.TIMEOUT = 60000;
// Default sytem update interval in ms.
var UPDATE_INTERVAL = 10000;

// Return the current time.
function now() {
  return new Date();
}

// Return time difference in ms.
function duration(startTime) {
  return now().getTime() - startTime.getTime();
}

// Timer used to report time metrics.
var Timer = function(metrics, key, timeout) {
  this.metrics = metrics;
  this.key = key;
  this.timeout = timeout || TIMEOUT;
  this.clear();
};

// Start or reset the timer.
Timer.prototype.start = function() {
  var metrics = this.metrics;
  var timeout = this.timeout;
  var key = this.key;

  this.clear();
  this.startTime = now();

  this._timeout = setTimeout(function() {
    metrics.count(key + '.overdue');
    log.warn('metrics timeout (%d) for %s', timeout, key);
  }, timeout);

  return this;
};

// Stop and clear timer, report metric.
Timer.prototype.stop = function() {
  if (this.startTime === null) {
    log.warn('tried to stop inactive timer for ' + this.key);
    return null;
  }

  this.metrics.timing(this.key, this.startTime);
  this.duration = duration(this.startTime);
  this.clear();

  return this.duration;
};

// Stop tracking time and timeouts, don't report anything.
Timer.prototype.clear = function() {
  clearTimeout(this._timeout);
  this._timeout = null;
  this.startTime = null;
  this.duration = null;
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

Session.prototype.timing = function(key, start) {
  return this.metrics.timing(this.key(key), start);
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

  stream.once('finish', function() {
    timer.stop();
    session.count(key + '.finish');
  });

  stream.once('close', function() {
    timer.clear();
    session.count(key + '.close');
  });

  stream.once('error', function() {
    timer.clear();
    session.count(key + '.error');
  });

  return timer;
};

// Metrics engine, used to track times and counters.
var Metrics = function(options) {
  this.clients = [];
  this.systemSession = this.session('system');
  this.updateInterval = options.metrics.interval.systemUpdate * 1000 ||
                        UPDATE_INTERVAL;

  if (!options.metrics.enabled) {
    return;
  }

  // Create a StatsD client and connect to the service.
  var statsdClient = new StatsdClient({
    host: options.metrics.statsd.host,
    port: options.metrics.statsd.port,
    prefix: options.metrics.statsd.prefix
  });

  this.clients.push(statsdClient);

  // Activate general system metrics.
  setInterval(this.update.bind(this), this.updateInterval);
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
//   timing: function(key, startTime)
// }
Metrics.prototype.use = function(client) {
  if (client) {
    // Attach user-provided middleware.
    this.clients.push(client);
  }
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

// Change the count value for given key by the given delta.
Metrics.prototype.count = function(key, delta) {
  if (delta === undefined) {
    delta = 1;
  }

  this.clients.forEach(function(client) {
    if (client.counter) {
      client.counter(key, delta);
    }
  });
};

// Update the 'gauge' value for given key.
Metrics.prototype.gauge = function(key, value) {
  this.clients.forEach(function(client) {
    if (client.gauge) {
      client.gauge(key, value);
    }
  });
};

Metrics.prototype.set = function(key, value) {
  this.clients.forEach(function(client) {
    if (client.set) {
      client.set(key, value);
    }
  });
};

// Add a timing entry for given key with given start time.
Metrics.prototype.timing = function(key, start) {
  this.clients.forEach(function(client) {
    if (client.timing) {
      client.timing(key, start);
    }
  });
};

module.exports = new Metrics(CONFIG);
