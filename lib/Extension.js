'use strict';

var _ = require('lodash');
var logger = require('nodelogger').Logger(__filename);
var schedule = require('node-schedule');

exports = module.exports = Extension;
var TYPE = 'mongoosejob';

function Extension(connection, config) {

    if (!connection) {
        throw new Error('You must pass an instance of mongoose or mongoose connection to MongooseJob ');
    }

    //-------------------------------------------------------------------------
    //
    // Public API
    //
    //-------------------------------------------------------------------------
    this.createJob = createJob;
    this.addJobHandler = addJobHandler;
    this.removeJob = removeJob;
    this.removeJobHandler = removeJobHandler;
    this.RecurrenceRule = schedule.RecurrenceRule;

    //-------------------------------------------------------------------------
    //
    // Private Methods
    //
    //-------------------------------------------------------------------------

    config = _.defaults(config || {}, {
        //Add global options here?
    });

    var jobHandlers = {
        /** Named job handlers **/
    };

    var jobs = {
        /** currently running jobs **/
    };

    var cancelling = {
        /** currently cancelling jobs **/
    };

    /**
     * Mongoose Model for direct interaction.
     * @type {*}
     */
    var Model = this.Model = initialize(connection, config);
    //Check db for jobs.
    Model.find({}, function (err, jobs) {
        if (err) {
            return logger.error(err);
        }
        _.each(jobs, function (job) {
            scheduleJob(job);
        });
    });

    function addJobHandler(name, callback) {
        logger.debug('Adding job handler', name);
        if (!_.isFunction(callback)) {
            logger.error('Adding job handler without callback!');
        }
        if (_.isUndefined(jobHandlers[name])) {
            jobHandlers[name] = [];
        }
        jobHandlers[name].push(callback);
    }

    function removeJobHandler(name, callback) {
        logger.debug('Removing job handler', name);
        if (_.isUndefined(jobHandlers[name])) {
            return;
        }
        jobHandlers[name] = _.without(jobHandlers[name], callback);
    }

    function createJob(name, options, callback) {
        if (_.isFunction(options)) {
            callback = options;
            options = {};
        }
        callback = createCallback(callback);
        options = _.defaults(options, {
            name: name,
            due: Date.now() + 60 * 1000,
            removeOnComplete: true,
            restart: false,
            recurring: false
        });

        Model.findOne({name: name}, function (err, job) {
            if (err) {
                logger.error('Error finding job', options, err);
            }
            if (job) {
                if (options.restart) {
                    cancelJob(job);
                    scheduleJob(job);
                }
                logger.debug('Updating job', name, ' for ', options.due);
                callback(null, job);
            } else {
                logger.debug('Creating job', name, ' for ', options.due);
                Model.create(options, function (err, job) {
                    if (err) {
                        logger.error('Error creating job!', options, err);
                        return callback(err);
                    }
                    scheduleJob(job);
                    callback(null, job);
                });
            }
        });
    }

    function runJob(job) {
        if (!cancelling[job.name]) {
            logger.debug('Running job ', job.name);
            var handlers = jobHandlers[job.name];
            if (!handlers) {
                logger.warn('Job run without handlers!', job);
                return;
            }
            _.each(handlers, function (handler) {
                handler(job);
            });
            if (job.removeOnComplete) {
                removeJob(job.name);
            }
        } else {
            logger.warn('Trying to run currently cancelling job', job.name);
            removeJob(job.name);
            cancelJob(job);
        }
    }

    function removeJob(name, callback) {
        logger.debug('cancelling job ', name);
        callback = createCallback(callback);
        cancelling[name] = name;
        Model.findOne({name: name}, function (err, job) {
            if (err) {
                logger.error('Unable to remove job', job.name, err);
                return callback(err);
            }
            if (job) {
                cancelJob(job);
                job.remove(function (err) {
                    if (err) {
                        logger.error('Error removing job!', job.name, err);
                    }
                    callback(err, job);
                });
            } else {
                callback(null);
            }
        });
    }

    function cancelJob(job) {
        logger.debug('Removing job ', job.name);
        if (jobs[job.name]) {
            jobs[job.name].cancel();
            delete jobs[job.name];
        }
        delete cancelling[job.name];
    }

    function scheduleJob(job) {
        var due = job.due;
        if (job.recurring) {
            due = schedule.RecurrenceRule(job.due);
        }
        var jobId = job._id.toString();
        logger.debug('Scheduling job ', job.name, ' for ', due);
        var scheduledJob = schedule.scheduleJob(due, function () {
            Model.findOne({_id: jobId}, function (err, job) {
                if (err) {
                    return logger.error(err);
                }
                if (!job) {
                    return;
                }
                if (jobs[job.name]) {
                    runJob(job);
                }
            });
        });
        jobs[job.name] = scheduledJob;
        job = null;
    }

    /**
     * Helper no-op method
     */
    function noop() {
    }

    function createCallback(callback) {
        if (!_.isFunction(callback)) {
            callback = noop;
        }
        return callback;
    }
}

function initialize(connection, options) {

    try {
        return connection.model(TYPE);
    } catch (e) {
        var schema = connection.model('____' + TYPE + '____', {}).schema;
        schema.add({
            type: {type: String, 'default': TYPE},
            created: {type: Date, 'default': Date.now},
            due: { type: {}, required: true },
            name: {type: String, require: true, unique: true},
            removeOnCompletion: {type: Boolean, 'default': true},
            recurring: {type: Boolean, 'default': false},
            data: {}
        });

        if (options.schema) {
            schema.add(options.schema);
        }

        return connection.model(TYPE, schema);
    }
}


