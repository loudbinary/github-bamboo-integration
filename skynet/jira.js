var util = require('util');
var async = require('async');
var JiraClient = require('jira-connector');
var pathModule = require('path');
var config = require('config');
var constants = process.binding('constants');
var jira = exports;
var skynet = module.parent.exports;

// Setup Jira Connection
_jira = new JiraClient({
    host: config.jira.get('url'),
    basic_auth: {
        username: config.jira.get('username'),
        password: config.jira.get('password')
    }
});

var Stream = require('stream').Stream;
var EventEmitter = require('events').EventEmitter;

var Readable = Stream.Readable;
var Writable = Stream.Writable;

var DEBUG = process.env.NODE_DEBUG;
var errnoException = util._errnoException;

//config.bamboo.authorization = Buffer.from(config.bamboo.username + ':' + config.bamboo.password).toString('base64');

var USERNAME = config.jira.get('username') || "MissingUserName";
var HOST = config.jira.get('url') || "MissingJiraUrl";
var PROJECT_ID = config.jira.project.get('id') || "MissingProjectId";

function rethrow() {
    // Only enable in debug mode. A backtrace uses ~1000 bytes of heap space and
    // is fairly slow to generate.
    if (DEBUG) {
        var backtrace = new Error;
        return function(err) {
            if (err) {
                backtrace.stack = err.name + ': ' + err.message +
                    backtrace.stack.substr(backtrace.name.length);
                err = backtrace;
                throw err;
            }
        };
    }

    return function(err) {
        if (err) {
            throw err;  // Forgot a callback but don't know where? Use NODE_DEBUG=fs
        }
    };
}

function maybeCallback(cb) {
    return util.isFunction(cb) ? cb : rethrow();
}

// Ensure that callbacks run in the global context. Only use this function
// for callbacks that are passed to the binding layer, callbacks that are
// invoked from JS already run in the proper scope.
function makeCallback(cb) {
    if (!util.isFunction(cb)) {
        return rethrow();
    }

    return function() {
        return cb.apply(null, arguments);
    };
}

jira.getIssue = function(event,callback){
    console.log('found me');
    callback(null,'ping from the other side');
}

jira.USERNAME = USERNAME;
jira.HOST = HOST;
jira.PROJECT_ID = PROJECT_ID;
