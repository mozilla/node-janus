'use strict';

var StatsdClient = require('statsd-client');
var CONFIG = require('config');
var os = require('os');
var cluster = require('cluster');

var log = require('./log');
var emit = require('./emit');

// Timer metric timeout in ms.
var TIMEOUT = 60000;

// Metrics engine, used to track times and counters.
var Metrics = function(options) {
  this.clients = [];

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

  // Activate general system metrics on the master process.
  if (cluster.isMaster) {
    setInterval(this.update.bind(this),
                options.metrics.interval.systemUpdate * 1000);
  }

  this.times = {};
};

// Add a client to handle metrics with following interface (all optional):
// {
//   counter: function(key, delta),
//   gauge: function(key, value),
//   set: function(key, value),
//   timing: function(key, start)
// }
Metrics.prototype.attachClient = function(client) {
  if (client) {
    // Attach user-provided client.
    this.clients.push(client);
  }
};

// Change the count value for given key by the given delta.
Metrics.prototype.count = function(key, delta) {
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

// Start tracking the time for given key.
Metrics.prototype.start = function(key) {
  var metrics = this;

  metrics.times[key] = [metrics.now(), metrics.now()];

  // Delete after given timeout.
  setTimeout(function() {
    metrics.end(key);
  }, TIMEOUT);
};

// End tracking the time for given startKey and add the time to the given key's
// metrics; startKey defaults to key.
Metrics.prototype.end = function(key, startKey) {
  startKey = startKey || key;
  var start = this.times[startKey];
  var diff = 0;

  if (start) {
    this.timing(key, start[0]);
    diff = this.now().getTime() - start[0].getTime();
    delete this.times[startKey];
  }

  return diff;
};

// Step-based timing keeps track of the time since the last step for the given
// startKey, adds the metric to the given key and updates the step time.
Metrics.prototype.step = function(key, startKey) {
  var start = this.times[startKey];
  if (start) {
    this.timing(key, start[1]);
    this.times[startKey][1] = this.now();
  }
};

// Return the current time.
Metrics.prototype.now = function() {
  return new Date();
};

// Measure the execution time of a given function.
Metrics.prototype.measure = function(key, fn) {
  var metrics = this;

  return function() {
    metrics.start(key);
    var ret = fn.apply(this, Array.prototype.slice.call(arguments, 0));
    metrics.end(key);
    return ret;
  };
};

// Update the system metrics.
Metrics.prototype.update = function() {
  var numCpus = os.cpus().length;

  this.gauge('cpu.num', numCpus);
  this.gauge('cpu.load.avg', os.loadavg()[0]);
  this.gauge('memory.total', os.totalmem());
  this.gauge('memory.free', os.freemem());

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

  for (var s in cpuStats) {
    if (cpuStats.hasOwnProperty(s)) {
      cpuStats[s] /= numCpus;
      this.gauge('cpu.' + s + '.avg', cpuStats[s]);
    }
  }
  log.debug('reporting system metrics');
};

// Track metric events for given emitter by name.
Metrics.prototype.track = function(name) {
  var metrics = this;

  if (!metrics.clients) {
    return;
  }

  var emitter = emit.get(name);
  log.debug('tracking ' + name);

  emitter.on('count', function(e, val) {
    val = val || 1;
    metrics.count(e, val);
    log.debug('count %s: %d', e, val);
  });

  emitter.on('start', function(e) {
    metrics.start(e);
    metrics.count(e, 1);
    log.debug('start ' + e);
  });

  emitter.on('end', function(e) {
    var time = metrics.end(e);
    log.debug('end %s: %dms', e, time.toFixed(2));
  });
};

// Track all metric events of current and future emitters.
Metrics.prototype.trackAll = function() {
  var metrics = this;

  if (!metrics.clients) {
    return;
  }

  for (var name in emit.emitters) {
    if (emit.emitters.hasOwnProperty(name)) {
      metrics.track(name);
    }
  }

  emit.on('create', function(name) {
    metrics.track(name);
  });
};

module.exports = new Metrics(CONFIG);
